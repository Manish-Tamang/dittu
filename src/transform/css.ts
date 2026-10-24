import { atRule, type AtRule, type ChildNode, type Declaration, type Root } from 'postcss';
import safeParse from 'postcss-safe-parser';
import valueParser from 'postcss-value-parser';
import type { APIRequestContext } from 'playwright';
import type { SheetEntry } from '../domain/snapshot.js';
import type { NetworkRecorder } from '../capture/network.js';
import type { AssetStore } from './assets.js';
import { resolveUrl } from '../util/url.js';

interface CssContext {
  network: NetworkRecorder;
  request: APIRequestContext;
  store: AssetStore;
  pageUrl: string;
}

/** Base URL each declaration's url()s resolve against (its stylesheet's URL). */
const declBase = new WeakMap<Declaration, string>();

const IMPORT_RE = /^\s*(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*(.*)$/s;

async function fetchText(url: string, ctx: CssContext, fallback?: string | null): Promise<string | null> {
  const recorded = ctx.network.text(url);
  if (recorded !== undefined) return recorded;
  if (fallback) return fallback;
  try {
    const res = await ctx.request.get(url, {
      headers: { referer: ctx.pageUrl },
      timeout: 30_000,
      failOnStatusCode: false,
    });
    return res.ok() ? await res.text() : null;
  } catch {
    return null;
  }
}

function wrap(nodes: ChildNode[], name: string, params: string): ChildNode[] {
  const rule = atRule({ name, params });
  rule.append(nodes);
  return [rule];
}

/** Parse tolerantly (browser-accepted CSS must never fail a Next/Astro build) and inline @import. */
async function parseSheet(text: string, base: string, ctx: CssContext, depth = 0): Promise<Root> {
  const root = safeParse(text) as Root;
  const imports: AtRule[] = [];
  root.walkAtRules('import', (rule) => {
    imports.push(rule);
  });
  for (const rule of imports) {
    const m = IMPORT_RE.exec(rule.params);
    const href = m ? resolveUrl(m[2] ?? m[4], base) : null;
    if (!m || !href || depth > 5) {
      rule.remove();
      continue;
    }
    let rest = m[5].trim();
    let layer: string | null = null;
    let supports: string | null = null;
    const lm = /^layer(?:\(([^)]*)\))?\s*/i.exec(rest);
    if (lm) {
      layer = lm[1] ?? '';
      rest = rest.slice(lm[0].length);
    }
    const sm = /^supports\((.*?)\)\s*/i.exec(rest);
    if (sm) {
      supports = sm[1];
      rest = rest.slice(sm[0].length);
    }
    const imported = await fetchText(href, ctx);
    if (imported === null) {
      // leave it pointing at the original
      rule.params = `url("${href}")${m[5] ? ' ' + m[5] : ''}`;
      continue;
    }
    const child = await parseSheet(imported, href, ctx, depth + 1);
    let nodes = child.nodes.slice() as ChildNode[];
    if (layer !== null) {
      if (layer) nodes = wrap(nodes, 'layer', layer);
      else {
        const anon = atRule({ name: 'layer' });
        anon.append(nodes);
        nodes = [anon];
      }
    }
    if (supports) nodes = wrap(nodes, 'supports', `(${supports})`);
    if (rest && rest.toLowerCase() !== 'all') nodes = wrap(nodes, 'media', rest);
    rule.replaceWith(nodes);
  }
  // Remember each declaration's base URL; imported sheets resolve relative to themselves.
  root.walkDecls((d) => {
    if (!declBase.has(d)) declBase.set(d, base);
  });
  return root;
}

function forEachUrl(value: string, fn: (url: string) => string | void): string {
  if (!/url\(|image-set\(/i.test(value)) return value;
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type !== 'function') return;
    const name = node.value.toLowerCase();
    if (name === 'url') {
      const inner = node.nodes[0];
      if (!inner) return false;
      const replaced = fn(inner.value.trim());
      if (replaced !== undefined) {
        node.nodes = [
          { type: 'string', value: replaced, quote: '"', sourceIndex: 0, sourceEndIndex: 0 } as valueParser.StringNode,
        ];
      }
      return false;
    }
    if (name === 'image-set' || name === '-webkit-image-set') {
      for (const child of node.nodes) {
        if (child.type === 'string') {
          const replaced = fn(child.value);
          if (replaced !== undefined) child.value = replaced;
        }
      }
    }
    return undefined;
  });
  return parsed.toString();
}

const isLocalRef = (u: string) => !u || u.startsWith('data:') || u.startsWith('#') || u.startsWith('about:');

/** Build one stylesheet for a page: all sheets in cascade order, assets local. */
export async function buildCss(sheets: SheetEntry[], baseURI: string, ctx: CssContext): Promise<string> {
  const parts: { root: Root; label: string; media: string }[] = [];
  for (const sheet of sheets) {
    let text: string | null;
    let base = baseURI;
    if (sheet.kind === 'link' && sheet.href) {
      base = sheet.href;
      text = await fetchText(sheet.href, ctx, sheet.cssom);
    } else {
      text = sheet.text ?? '';
    }
    if (!text || !text.trim()) continue;
    const root = await parseSheet(text, base, ctx);
    parts.push({
      root,
      label: sheet.kind === 'link' ? sheet.href! : `inline <${sheet.kind}>${sheet.fromCssom ? ' (CSSOM)' : ''}`,
      media: sheet.media,
    });
  }

  // Collect, download, then rewrite every url() reference.
  const wanted = new Map<string, 'font' | 'image'>();
  for (const { root } of parts) {
    root.walkDecls((d) => {
      const base = declBase.get(d)!;
      const inFontFace = d.parent?.type === 'atrule' && (d.parent as AtRule).name.toLowerCase() === 'font-face';
      forEachUrl(d.value, (u) => {
        if (isLocalRef(u)) return;
        const abs = resolveUrl(u, base);
        if (abs && !wanted.has(abs)) wanted.set(abs, inFontFace ? 'font' : 'image');
      });
    });
  }
  await Promise.all([...wanted].map(([u, kind]) => ctx.store.ensure(u, kind, ctx.pageUrl)));

  const out: string[] = [];
  for (const { root, label, media } of parts) {
    root.walkDecls((d) => {
      const base = declBase.get(d)!;
      d.value = forEachUrl(d.value, (u) => {
        if (isLocalRef(u)) return;
        const abs = resolveUrl(u, base);
        if (!abs) return;
        return ctx.store.get(abs) ?? abs;
      });
    });
    let css = root.toString();
    if (media && media !== 'all') css = `@media ${media} {\n${css}\n}`;
    out.push(`/* dittu: ${label.replace(/\*\//g, '* /')} */\n${css}`);
  }
  return out.join('\n\n');
}
