import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, newContext } from '../capture/browser.js';
import { capturePage } from '../capture/capture.js';
import { CrawlQueue, loadRobots } from '../capture/crawl.js';
import { NetworkRecorder } from '../capture/network.js';
import type { Framework, Manifest, Styling } from '../domain/report.js';
import { routeScope, type PageModel, type SiteModel } from '../domain/site.js';
import type { CaptureResult, MotionItem, ResponsiveItem, Viewport } from '../domain/snapshot.js';
import { exportAstro } from '../export/astro.js';
import { exportNext } from '../export/next.js';
import { exportStatic } from '../export/static.js';
import { AssetStore } from '../transform/assets.js';
import { formatCode } from '../export/jsx.js';
import { reconstructSite } from '../reconstruct/index.js';
import { buildCss } from '../transform/css.js';
import { cleanupAttributes, collectTokens, pruneCss } from '../transform/prune.js';
import { localIcons, transformBody } from '../transform/html.js';
import { tailwindSite } from '../transform/tailwind/index.js';
import { hash } from '../util/hash.js';
import { log } from '../util/log.js';
import { bridgePath } from '../util/paths.js';
import { normalizePageUrl } from '../util/url.js';

export interface CloneOptions {
  url: string;
  outDir: string;
  frameworks: Framework[];
  pages: number;
  viewport: Viewport;
  /** Mobile render used to capture JS-computed layout differences (null = off). */
  mobile: Viewport | null;
  /** Width below which the mobile values apply. */
  breakpoint: number;
  remove: string[];
  waitMs: number;
  /** Extract components (icons, repeated structures, sections); false = one component per page. */
  split: boolean;
  format: boolean;
  /** Keep the original CSS, or convert class rules to Tailwind utilities where lossless. */
  styling: Styling;
}

export interface CloneResult {
  site: SiteModel;
  manifest: Manifest;
  outputs: { preview: string; next?: string; astro?: string };
  warnings: Record<string, string[]>;
  failedAssets: string[];
  assetBytes: number;
}

interface CapturedPage {
  url: string;
  route: string;
  cap: CaptureResult;
}

/** CSS overrides for inline styles that the site's JS sets differently at mobile width. */
function responsiveCss(items: ResponsiveItem[], mq: string): string {
  const rules: string[] = [];
  for (const r of items) {
    if (!r.values || !r.props.length) continue;
    const decls = r.props
      .filter((p) => r.values![p])
      .map((p) => `${p}: ${r.values![p]} !important;`)
      .join(' ');
    if (decls) rules.push(`  [data-dittu-r="${r.id}"] { ${decls} }`);
  }
  return rules.length
    ? `\n\n/* dittu: layout computed by JS at mobile width */\n@media ${mq} {\n${rules.join('\n')}\n}\n`
    : '';
}

/**
 * Remove a previous run's results so nothing stale survives (old reference
 * screenshots would be reused by verify, old components would stay in the build).
 * Generated projects keep node_modules to make rebuilds fast.
 */
function prepareOutDir(outDir: string) {
  for (const name of ['preview', 'assets', 'reference', 'report', 'dittu.json']) {
    rmSync(join(outDir, name), { recursive: true, force: true });
  }
  for (const project of ['next', 'astro']) {
    const dir = join(outDir, project);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (entry !== 'node_modules') rmSync(join(dir, entry), { recursive: true, force: true });
    }
  }
  mkdirSync(join(outDir, 'reference'), { recursive: true });
}

const kb = (s: string) => `${Math.round(Buffer.byteLength(s) / 1024)} KB`;

/** URL → route path, unique among already-used routes. */
function routeFor(url: string, used: Set<string>): string {
  let route = new URL(url).pathname.replace(/\/+$/, '') || '/';
  for (let n = 2; used.has(route); n++) route = `${route}-${n}`;
  return route;
}

/** Capture → transform → export. Verification is a separate step (see verify/). */
export async function clone(opts: CloneOptions): Promise<CloneResult> {
  const { outDir } = opts;
  const start = normalizePageUrl(opts.url);
  if (!start) throw new Error(`Invalid URL: ${opts.url}`);
  prepareOutDir(outDir);

  const browser = await launch();
  const context = await newContext(browser, opts.viewport, { record: true });
  const network = new NetworkRecorder();
  network.attach(context);
  const mobileContext = opts.mobile ? await newContext(browser, opts.mobile) : undefined;
  if (mobileContext) network.attach(mobileContext);
  const mq = `(max-width: ${opts.breakpoint - 0.02}px)`;

  try {
    // ------------------------------------------------------------ capture
    const captured: CapturedPage[] = [];
    const crawl = new CrawlQueue(start, new URL(start).origin);
    const usedRoutes = new Set<string>();

    for (let url = crawl.next(); url && captured.length < opts.pages; url = crawl.next()) {
      log.step(`Capturing ${url}`);
      const route = routeFor(url, usedRoutes);
      const referencePath = join(outDir, 'reference', `${routeScope(route)}@${opts.viewport.width}.png`);
      let cap: CaptureResult;
      try {
        cap = await capturePage(context, url, {
          waitMs: opts.waitMs,
          remove: opts.remove,
          referencePath,
          mobileContext,
        });
      } catch (err) {
        if (!captured.length) throw err;
        log.warn(`Skipped ${url}: ${(err as Error).message}`);
        continue;
      }
      usedRoutes.add(route);
      const finalUrl = normalizePageUrl(cap.snapshot.url) ?? url;
      if (!captured.length) {
        // follow redirects (apex → www etc.)
        crawl.origin = new URL(cap.snapshot.url).origin;
        if (opts.pages > 1) crawl.allowed = await loadRobots(context.request, crawl.origin);
      }
      crawl.markSeen(finalUrl);
      captured.push({ url: finalUrl, route, cap });
      const s = cap.snapshot;
      log.info(
        `${s.bodyHtml.length.toLocaleString()} chars of markup, ${s.sheets.length} stylesheets, ` +
          `${s.motion.length} animations, ${s.responsive.length} JS-responsive elements`,
      );
      crawl.enqueue(cap.links);
    }
    await network.flush();

    // ---------------------------------------------------------- transform
    log.step('Rewriting markup, styles and assets');
    const store = new AssetStore(outDir, network, context.request, { fetchUnloaded: true });
    const routeByUrl = new Map(captured.map((c) => [c.url, c.route]));
    const resolveLink = (abs: string) => {
      const n = normalizePageUrl(abs);
      const route = n ? routeByUrl.get(n) : undefined;
      return route ? route + new URL(abs).hash : null;
    };

    const pages: PageModel[] = [];
    const pageCss: string[] = [];
    for (const { url, route, cap } of captured) {
      const s = cap.snapshot;
      const body = await transformBody(cap, store, resolveLink);
      const fullCss =
        (await buildCss(s.sheets, s.baseURI, { network, request: context.request, store, pageUrl: s.url })) +
        responsiveCss(s.responsive, mq);
      // Classes the runtime toggles count as used.
      const toggled = [...s.motion, ...s.responsive].flatMap((m) => ('add' in m ? [...m.add, ...m.remove] : []));
      const pruned = pruneCss(fullCss, collectTokens(body, [...s.htmlAttrs, ...s.bodyAttrs], toggled));
      const removedAttrs = cleanupAttributes(body, pruned.attrsUsed);
      log.info(
        `${route}: dropped ${pruned.removedRules.toLocaleString()} unused CSS rules (${kb(fullCss)} → ${kb(pruned.css)}), ${removedAttrs.toLocaleString()} unused data-* attributes`,
      );
      const motion: MotionItem[] = [
        ...s.motion,
        ...s.responsive
          .filter((r) => r.add.length || r.remove.length)
          .map((r): MotionItem => ({ id: r.id, type: 'resp', mq, add: r.add, remove: r.remove })),
      ];
      pageCss.push(pruned.css);
      pages.push({
        route,
        url,
        title: s.title,
        description: s.metas.find(([k]) => k.toLowerCase() === 'description')?.[1],
        icons: await localIcons(cap, store),
        htmlAttrs: s.htmlAttrs,
        bodyAttrs: s.bodyAttrs,
        body,
        css: '',
        motion,
        warnings: s.warnings,
      });
    }

    let tailwind: Awaited<ReturnType<typeof tailwindSite>> | undefined;
    if (opts.styling === 'tailwind') {
      log.step('Converting styles to Tailwind');
      tailwind = await tailwindSite(pages.map((p, i) => ({ ...p, css: pageCss[i] })));
      tailwind.pages.forEach((t, i) => {
        Object.assign(pages[i], { htmlAttrs: t.htmlAttrs, bodyAttrs: t.bodyAttrs, motion: t.motion });
        pageCss[i] = t.css;
      });
    }

    const cssFiles = new Map<string, string>();
    const writeCss = async (name: string, text: string) => {
      const css = opts.format ? await formatCode(text, 'css') : text;
      const cssHash = hash(css);
      let path = cssFiles.get(cssHash);
      if (!path) {
        path = store.writeFile('css', `${name}-${cssHash}.css`, css);
        cssFiles.set(cssHash, path);
      }
      return path;
    };
    for (const [i, page] of pages.entries()) page.css = await writeCss(routeScope(page.route), pageCss[i]);
    if (tailwind) {
      const path = await writeCss('tailwind', tailwind.previewCss);
      for (const page of pages) page.tailwindCss = path;
    }
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    copyFileSync(bridgePath('runtime/motion.js'), join(outDir, 'assets', 'dittu-motion.js'));
    if (store.failed.length) log.warn(`${store.failed.length} assets could not be downloaded (kept as remote URLs)`);
    log.info(`${(store.bytes / 1024 / 1024).toFixed(1)} MB of assets`);

    const site: SiteModel = {
      startUrl: opts.url,
      origin: crawl.origin,
      pages,
      ...(tailwind ? { tailwind: { input: tailwind.input } } : {}),
    };

    // ------------------------------------------------------------- export
    const outputs: CloneResult['outputs'] = { preview: exportStatic(site, outDir) };
    log.ok(`Static preview → ${outputs.preview}`);
    if (opts.frameworks.length) {
      log.step('Reconstructing components');
      const recon = reconstructSite(site, { components: opts.split });
      const st = recon.stats;
      log.info(
        `${recon.components.length} components: ${st.sections} sections, ${st.repeats} repeated, ${st.icons} icons · ${st.loops} inline loops · ${st.repeatInstances} repeated items` +
          (st.skipped ? ` · ${st.skipped} candidates skipped (not lossless)` : ''),
      );
      if (opts.frameworks.includes('next')) {
        outputs.next = await exportNext(site, recon, outDir, opts);
        log.ok(`Next.js project → ${outputs.next}`);
      }
      if (opts.frameworks.includes('astro')) {
        outputs.astro = await exportAstro(site, recon, outDir, opts);
        log.ok(`Astro project → ${outputs.astro}`);
      }
    }

    const manifest: Manifest = {
      startUrl: opts.url,
      viewport: opts.viewport,
      pages: pages.map((p) => ({ route: p.route, url: p.url })),
      frameworks: opts.frameworks,
      styling: opts.styling,
    };
    const warnings = Object.fromEntries(pages.map((p) => [p.route, p.warnings]));
    writeFileSync(
      join(outDir, 'dittu.json'),
      JSON.stringify(
        { ...manifest, createdAt: new Date().toISOString(), warnings, failedAssets: store.failed },
        null,
        2,
      ),
    );
    for (const p of pages) for (const w of p.warnings) log.warn(`${p.route}: ${w}`);
    return { site, manifest, outputs, warnings, failedAssets: store.failed, assetBytes: store.bytes };
  } finally {
    await mobileContext?.close();
    await context.close();
    await browser.close();
  }
}
