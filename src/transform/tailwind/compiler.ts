import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parse, type AtRule, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { __unstable__loadDesignSystem, compile } from 'tailwindcss';
import { unquoteUrls } from './candidates.js';
import type { Condition } from './cascade.js';
import { specificity } from './cascade.js';

const require = createRequire(import.meta.url);

/**
 * The order of every cascade layer in the output. Tailwind's theme variables
 * sit lowest (the site's own values win), the site's layers next, and
 * Tailwind's utilities above them.
 */
export const layerStatement = (siteLayers: string[]) =>
  `@layer ${['properties', 'theme', ...siteLayers, 'base', 'components', 'utilities'].join(', ')};`;

/** A site that was itself built with Tailwind v4: its theme variables and custom variants. */
export interface SiteTheme {
  vars: [string, string][];
  /** Selector suffix of a class-based `dark:` variant, e.g. `:is(.dark *)`. */
  dark?: string;
}

/**
 * Tailwind entry CSS for generated projects. Never preflight (the site's own
 * base styles stay in charge). For sites not built with Tailwind, theme values
 * are inlined rather than emitted as variables (so they can't clash with the
 * site's custom properties) and `hover:` is a plain `:hover` like hand-written
 * CSS. For Tailwind v4 sites, the site's theme and variants are reproduced so
 * its own classes regenerate the same CSS.
 */
export function tailwindInput(siteLayers: string[], theme?: SiteTheme | null): string {
  const lines = [layerStatement(siteLayers)];
  if (theme) {
    lines.push('@import "tailwindcss/theme.css" layer(theme);');
    lines.push('@import "tailwindcss/utilities.css" layer(utilities);');
    lines.push(`@theme {\n${theme.vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`);
    if (theme.dark) lines.push(`@custom-variant dark (&${theme.dark});`);
  } else {
    lines.push('@import "tailwindcss/theme.css" layer(theme) theme(reference inline);');
    lines.push('@import "tailwindcss/utilities.css" layer(utilities);');
    lines.push('@custom-variant hover (&:hover);');
  }
  return lines.join('\n') + '\n';
}

const loadStylesheet = async (id: string, base: string) => {
  const path = require.resolve(id);
  return { path, base, content: await readFile(path, 'utf8') };
};

export interface Expected {
  prop: string;
  value: string;
  important: boolean;
  states: string[];
  conditions: Condition[];
}

export interface Verified {
  candidate: string;
  /** Tailwind-internal custom properties the utility sets or registers (`--tw-*`). */
  twVars: string[];
  /** Specificity of the generated selector. */
  specificity: number;
}

type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

/** Tailwind's compiler, used to check candidates and build the preview stylesheet. */
export class TailwindCompiler {
  private constructor(
    private ds: DesignSystem,
    readonly theme: SiteTheme | null,
  ) {}

  static async create(theme: SiteTheme | null = null): Promise<TailwindCompiler> {
    // The design-system API is internal to Tailwind; tailwindcss is pinned to an exact version.
    const ds = await __unstable__loadDesignSystem(tailwindInput([], theme), { base: '/', loadStylesheet });
    return new TailwindCompiler(ds, theme);
  }

  /** CSS for each candidate, null when it isn't a valid class. */
  css(candidates: string[]): (string | null)[] {
    return candidates.length ? this.ds.candidatesToCss(candidates) : [];
  }

  /** Tailwind's class order (what prettier-plugin-tailwindcss sorts by). */
  order(candidates: string[]): Map<string, bigint> {
    const out = new Map<string, bigint>();
    for (const [c, o] of this.ds.getClassOrder(candidates)) if (o !== null) out.set(c, o);
    return out;
  }

  isCandidate(cls: string): boolean {
    return this.css([cls])[0] !== null;
  }

  /** The stylesheet a project build would produce for these classes. */
  async build(candidates: string[], siteLayers: string[]): Promise<string> {
    const compiler = await compile(tailwindInput(siteLayers, this.theme), { base: '/', loadStylesheet });
    return compiler.build(candidates);
  }
}

/**
 * One spelling per value: strings single-quoted (as encodeValue writes them),
 * and, outside strings, whitespace CSS ignores removed (minified and formatted
 * CSS compare equal) and leading zeros added. Case is kept.
 */
const normValue = (v: string) =>
  unquoteUrls(v)
    .trim()
    .replace(/"([^"']*)"/g, "'$1'")
    .split(/('[^']*')/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/\s+/g, ' ')
            .replace(/\s*([,*/()])\s*/g, '$1')
            .replace(/(^|[^\w.-])\.(\d)/g, '$10.$2'),
    )
    .join('');

/** Keywords and colors are case-insensitive; strings and URLs are not. */
const caseFold = (v: string) => (/['"]|url\(/i.test(v) ? v : v.toLowerCase());

function expandHex(v: string) {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}${m[4] ? m[4] + m[4] : ''}` : v;
}

const NAMED_COLORS: Record<string, string> = { white: '#ffffff', black: '#000000' };

/** A single number with a unit ("1rem", ".5rem", "0"), or Tailwind's inlined `calc(0.25rem * 4)`. */
function dimension(v: string): { n: number; unit: string } | null {
  const calc = /^calc\((-?\d*\.?\d+)([a-z%]*) ?\* ?(-?\d*\.?\d+)\)$/.exec(v);
  if (calc) return { n: Number(calc[1]) * Number(calc[3]), unit: calc[2] };
  const m = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(v);
  return m ? { n: Number(m[1]), unit: m[2] } : null;
}

/** Properties where a number and a percentage mean the same (`0.6` ≡ `60%`). */
const RATIO = /^(opacity|fill-opacity|stroke-opacity|flood-opacity|stop-opacity|scale)$/;

/** Equivalent units in one form: seconds as ms, ratio percentages as numbers. */
function canonical(d: { n: number; unit: string } | null, prop: string) {
  if (!d) return null;
  if (d.unit === 's') return { n: d.n * 1000, unit: 'ms' };
  if (d.unit === '%' && RATIO.test(prop)) return { n: d.n / 100, unit: '' };
  return d;
}

export function sameValue(a: string, b: string, prop = ''): boolean {
  const x = caseFold(normValue(a));
  const y = caseFold(normValue(b));
  if (x === y) return true;
  const cx = expandHex(NAMED_COLORS[x] ?? x);
  const cy = expandHex(NAMED_COLORS[y] ?? y);
  if (cx === cy) return true;
  const dx = canonical(dimension(x), prop);
  const dy = canonical(dimension(y), prop);
  if (!dx || !dy) return false;
  if (dx.n === 0 && dy.n === 0) return true;
  return dx.unit === dy.unit && Math.abs(dx.n - dy.n) < 1e-9;
}

/** Media params in one comparable form: `(min-width: 700px)` ≡ `(width >= 700px)`. */
export function normMedia(params: string): string {
  return params
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([():,])\s*/g, '$1')
    .replace(/\(min-(width|height):([^)]+)\)/g, '($1>=$2)')
    .replace(/\(max-(width|height):([^)]+)\)/g, '($1<=$2)')
    .replace(/\s*(>=|<=|>|<)\s*/g, '$1')
    .trim();
}

const condKey = (c: Condition) =>
  `${c.name} ${
    c.name === 'media'
      ? normMedia(c.params)
      : normValue(c.params)
          .toLowerCase()
          .replace(/\s*([():,])\s*/g, '$1')
  }`;

/** Does a candidate's CSS produce exactly the expected declaration, conditions and states? */
export function verify(candidate: string, css: string | null, exp: Expected): Verified | null {
  if (!css) return null;
  let root;
  try {
    root = parse(css);
  } catch {
    return null;
  }
  const rules: Rule[] = [];
  const twVars: string[] = [];
  root.walk((n) => {
    if (n.type === 'rule') rules.push(n);
    else if (n.type === 'atrule' && n.name === 'property') twVars.push(n.params.trim());
  });
  if (rules.length !== 1) return null;
  const rule = rules[0];

  // Selector: the class itself followed by pseudo-classes only.
  const states: string[] = [];
  let shapeOk = true;
  selectorParser((sel) => {
    if (sel.nodes.length !== 1) shapeOk = false;
    sel.nodes[0]?.each((node, i) => {
      if (i === 0) shapeOk &&= node.type === 'class';
      else if (node.type === 'pseudo' && !node.value.startsWith('::') && node.nodes.length === 0)
        states.push(node.value.toLowerCase());
      else shapeOk = false;
    });
  }).processSync(rule.selector);
  if (!shapeOk || states.toSorted().join() !== exp.states.toSorted().join()) return null;

  // Enclosing at-rules (Tailwind's layer aside) must equal the original conditions.
  const conditions: Condition[] = [];
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    const at = p as AtRule;
    if (at.name === 'layer') continue;
    if (at.name !== 'media' && at.name !== 'supports') return null;
    conditions.push({ name: at.name, params: at.params });
  }
  if (conditions.map(condKey).toSorted().join('|') !== exp.conditions.map(condKey).toSorted().join('|')) return null;

  // Exactly the expected declaration; anything else must be Tailwind-internal (--tw-*).
  let found = 0;
  for (const node of rule.nodes) {
    if (node.type !== 'decl') return null;
    const prop = node.prop.startsWith('--') ? node.prop : node.prop.toLowerCase();
    if (prop === exp.prop) {
      if (!sameValue(node.value, exp.value, prop) || !!node.important !== exp.important) return null;
      found++;
    } else if (prop.startsWith('--tw-')) twVars.push(prop);
    else return null;
  }
  if (found !== 1) return null;
  return { candidate, twVars, specificity: specificity(rule.selector) ?? 0 };
}

const normSelector = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~,()])\s*/g, '$1')
    .trim();

/** Does a class regenerate exactly the original rule (same selector, conditions and declarations)? */
export function verifyRule(
  candidate: string,
  css: string | null,
  rule: { selector: string; conditions: Condition[]; decls: { prop: string; value: string; important: boolean }[] },
): Verified | null {
  if (!css) return null;
  let root;
  try {
    root = parse(css);
  } catch {
    return null;
  }
  const rules: Rule[] = [];
  const twVars: string[] = [];
  root.walk((n) => {
    if (n.type === 'rule') rules.push(n);
    else if (n.type === 'atrule' && n.name === 'property') twVars.push(n.params.trim());
  });
  if (rules.length !== 1) return null;
  const [r] = rules;
  if (normSelector(r.selector) !== normSelector(rule.selector)) return null;
  const conditions: Condition[] = [];
  for (let p = r.parent; p && p.type !== 'root'; p = p.parent) {
    const at = p as AtRule;
    if (at.name === 'layer') continue;
    if (at.name !== 'media' && at.name !== 'supports') return null;
    conditions.push({ name: at.name, params: at.params });
  }
  if (conditions.map(condKey).toSorted().join('|') !== rule.conditions.map(condKey).toSorted().join('|')) return null;
  // Same declarations in the same order (order decides between shorthands and longhands).
  const decls = r.nodes.filter((n) => n.type === 'decl');
  if (decls.length !== r.nodes.length || decls.length !== rule.decls.length) return null;
  const same = rule.decls.every((d, i) => {
    const n = decls[i];
    const prop = n.prop.startsWith('--') ? n.prop : n.prop.toLowerCase();
    return prop === d.prop && sameValue(n.value, d.value, prop) && !!n.important === d.important;
  });
  if (!same) return null;
  return { candidate, twVars, specificity: specificity(r.selector) ?? 0 };
}
