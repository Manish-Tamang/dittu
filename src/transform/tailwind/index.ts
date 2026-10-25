import type { Root } from 'hast';
import type { MotionItem } from '../../domain/snapshot.js';
import { log } from '../../util/log.js';
import { cssModel } from './cascade.js';
import { layerStatement, tailwindInput, TailwindCompiler, type SiteTheme } from './compiler.js';
import { convertPage } from './convert.js';

export interface TailwindPage {
  route: string;
  body: Root;
  css: string;
  htmlAttrs: [string, string][];
  bodyAttrs: [string, string][];
  motion: MotionItem[];
}

export interface TailwindSite {
  pages: { css: string; htmlAttrs: [string, string][]; bodyAttrs: [string, string][]; motion: MotionItem[] }[];
  /** Entry stylesheet for generated projects (Tailwind import + layer order). */
  input: string;
  /** What a project build produces for the classes in use, for the static preview. */
  previewCss: string;
}

const rename = (renames: Map<string, string>, list: string[]) => list.map((c) => renames.get(c) ?? c);

const toggledClasses = (motion: MotionItem[]) =>
  new Set(motion.flatMap((m) => ('add' in m ? [...m.add, ...m.remove] : [])));

/** Keep layer order consistent across pages: union in first-appearance order. */
function mergeLayers(lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) for (const l of list) if (!out.includes(l)) out.push(l);
  // The unlayered bucket must stay the last (highest) site layer.
  return [...out.filter((l) => l !== 'dittu-unlayered'), 'dittu-unlayered'];
}

/**
 * A site compiled by Tailwind v4 declares its theme as `:root, :host` custom
 * properties in `@layer theme`. Reproducing that theme (and a class-based
 * `dark:` variant) lets its own classes regenerate identical CSS.
 */
export function detectTheme(css: string[]): SiteTheme | null {
  const vars = new Map<string, string>();
  let dark: string | undefined;
  for (const text of css) {
    const model = cssModel(text);
    for (const r of model.rules) {
      const sel = r.selectors
        .map((s) => s.trim())
        .toSorted()
        .join(',');
      if (r.layer === 'theme' && sel === ':host,:root')
        for (const d of r.decls) if (d.prop.startsWith('--') && !vars.has(d.prop)) vars.set(d.prop, d.value);
      if (!dark)
        for (const s of r.selectors) {
          const m = /^\.dark\\:[\w-]+(:(?:is|where)\(.*\))$/.exec(s.trim());
          if (m) dark = m[1];
        }
    }
  }
  const themeLike = [...vars.keys()].some((k) => k === '--spacing' || /^--(color|font|text|radius)-/.test(k));
  return themeLike ? { vars: [...vars], ...(dark ? { dark } : {}) } : null;
}

/**
 * Convert every page's styles to Tailwind utilities where that renders
 * identically, and keep the rest as layered CSS. Bodies are changed in place.
 */
export async function tailwindSite(pages: TailwindPage[]): Promise<TailwindSite> {
  const theme = detectTheme(pages.map((p) => p.css));
  if (theme) log.info(`Built with Tailwind v4: reusing its theme (${theme.vars.length} variables) and classes`);
  const compiler = await TailwindCompiler.create(theme);
  // Tailwind-internal variables the site's own CSS already uses (sites built with Tailwind).
  const siteTwVars = new Set(pages.flatMap((p) => p.css.match(/--tw-[\w-]+/g) ?? []));

  const results = pages.map((p) => {
    const r = convertPage(
      { body: p.body, css: p.css, htmlAttrs: p.htmlAttrs, bodyAttrs: p.bodyAttrs, toggled: toggledClasses(p.motion) },
      compiler,
      siteTwVars,
    );
    const { rules, converted, declarations, elements } = r.stats;
    log.info(
      `${p.route}: ${converted.toLocaleString()} of ${rules.toLocaleString()} CSS rules → Tailwind (${declarations.toLocaleString()} declarations on ${elements.toLocaleString()} elements, ${r.classes.size.toLocaleString()} utilities)`,
    );
    return r;
  });

  const layers = mergeLayers(results.map((r) => r.layers));
  const statement = layerStatement(layers);
  const classes = new Set(results.flatMap((r) => [...r.classes]));

  return {
    pages: results.map((r, i) => {
      r.css.walkAtRules('charset', (at) => void at.remove());
      return {
        css: `${statement}\n\n${r.css.toString()}`,
        htmlAttrs: r.htmlAttrs,
        bodyAttrs: r.bodyAttrs,
        motion: pages[i].motion.map((m) =>
          'add' in m ? { ...m, add: rename(r.renames, m.add), remove: rename(r.renames, m.remove) } : m,
        ),
      };
    }),
    input: tailwindInput(layers, theme),
    previewCss: await compiler.build([...classes], layers),
  };
}
