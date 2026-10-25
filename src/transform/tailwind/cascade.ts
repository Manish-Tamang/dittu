import { parse, type Container, type Root, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

/** An enclosing conditional group rule. */
export interface Condition {
  name: 'media' | 'supports';
  params: string;
}

export interface Decl {
  prop: string;
  value: string;
  important: boolean;
  /** Position inside its rule (later declarations win ties). */
  index: number;
}

export interface StyleRule {
  /** Source order across the whole stylesheet. */
  index: number;
  node: Rule;
  selectors: string[];
  decls: Decl[];
  /** Dotted cascade layer path, null when unlayered. */
  layer: string | null;
  conditions: Condition[];
  /** Why this rule can never be converted (nesting, unsupported at-rule), or null. */
  blocked: string | null;
}

export interface CssModel {
  root: Root;
  rules: StyleRule[];
  /** Layer paths in cascade order (first appearance). */
  layers: string[];
}

const CONDITIONAL = new Set(['media', 'supports']);
/** At-rules whose contents are not ordinary style rules for the element itself. */
const OPAQUE =
  /keyframes$|^(font-face|property|counter-style|page|font-feature-values|font-palette-values|view-transition)$/i;

/** Parse a stylesheet into its style rules with cascade context (layer, conditions, order). */
export function cssModel(css: string): CssModel {
  const root = parse(css);
  const rules: StyleRule[] = [];
  const layers: string[] = [];
  let anon = 0;
  const addLayer = (path: string) => {
    if (!layers.includes(path)) layers.push(path);
  };

  const walk = (node: Container, layer: string | null, conditions: Condition[], blocked: string | null) => {
    node.each((child) => {
      if (child.type === 'rule') {
        const nested = child.parent?.type === 'rule' || child.some((n) => n.type === 'rule' || n.type === 'atrule');
        rules.push({
          index: rules.length,
          node: child,
          selectors: child.selectors,
          decls: child.nodes
            .filter((n) => n.type === 'decl')
            .map((d, index) => ({
              prop: d.prop.startsWith('--') ? d.prop : d.prop.toLowerCase(),
              // postcss keeps surrounding whitespace in custom property values; CSS ignores it.
              value: d.value.trim(),
              important: !!d.important,
              index,
            })),
          layer,
          conditions,
          blocked: blocked ?? (nested ? 'nested rule' : null),
        });
        // Nested rules: recorded so contests see them, never converted.
        if (child.nodes.some((n) => n.type === 'rule' || n.type === 'atrule'))
          walk(child, layer, conditions, 'nested rule');
        return;
      }
      if (child.type !== 'atrule') return;
      const name = child.name.toLowerCase();
      if (name === 'layer') {
        const names = child.params
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!child.nodes) {
          for (const n of names) addLayer(layer ? `${layer}.${n}` : n);
          return;
        }
        const path = layer ? `${layer}.${names[0] ?? `anon${anon++}`}` : (names[0] ?? `anon${anon++}`);
        addLayer(path);
        walk(child, path, conditions, blocked);
      } else if (CONDITIONAL.has(name) && child.nodes) {
        walk(child, layer, [...conditions, { name: name as Condition['name'], params: child.params }], blocked);
      } else if (child.nodes && !OPAQUE.test(name)) {
        walk(child, layer, conditions, `@${name}`);
      }
    });
  };
  walk(root, null, [], null);
  return { root, rules, layers };
}

/** Specificity as a single comparable number (ids, classes, types). */
export function specificity(selector: string): number | null {
  let result: number | null = null;
  try {
    selectorParser((root) => {
      result = Math.max(...root.nodes.map((sel) => score(sel)));
    }).processSync(selector);
  } catch {
    return null;
  }
  return result;
}

const LEGACY_PSEUDO_ELEMENTS = new Set([':before', ':after', ':first-line', ':first-letter']);

function score(container: selectorParser.Container): number {
  let total = 0;
  container.each((node) => {
    switch (node.type) {
      case 'id':
        total += 1_000_000;
        break;
      case 'class':
      case 'attribute':
        total += 1_000;
        break;
      case 'tag':
        total += 1;
        break;
      case 'pseudo': {
        const name = node.value.toLowerCase();
        if (name.startsWith('::') || LEGACY_PSEUDO_ELEMENTS.has(name)) total += 1;
        else if (name === ':where') break;
        else if ([':is', ':not', ':has', ':matches', ':-webkit-any', ':-moz-any'].includes(name))
          total += Math.max(0, ...node.nodes.map((n) => score(n)));
        else if (/^:nth-(last-)?child$/.test(name) && node.nodes.length > 1)
          total += 1_000 + Math.max(0, ...node.nodes.slice(1).map((n) => score(n)));
        else total += 1_000;
        break;
      }
      case 'selector':
        total += score(node);
        break;
      default:
        break;
    }
  });
  return total;
}

/**
 * Properties that can affect each other through shorthands share a family
 * (used to find candidate conflicts; `overlaps` decides).
 */
export function family(prop: string): string {
  const p = prop.replace(/^-(webkit|moz|ms|o)-/, '');
  if (p.startsWith('--')) return p;
  if (p === 'all') return 'all';
  const box = /^(scroll-margin|scroll-padding|margin|padding)\b/.exec(p);
  if (box) return box[1];
  if (/^(inset|top|right|bottom|left)\b/.test(p)) return 'inset';
  if (p.startsWith('border') && p.includes('radius')) return 'border-radius';
  if (p.startsWith('border')) return 'border';
  if (/^(font|line-height)/.test(p)) return 'font';
  if (/^(gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/.test(p)) return 'gap';
  if (/^(grid|grid-)/.test(p)) return 'grid';
  if (/^flex(-grow|-shrink|-basis)?$/.test(p)) return 'flex';
  if (/^flex-(flow|direction|wrap)$/.test(p)) return 'flex-flow';
  const placement = /^(place|align|justify)-(content|items|self)$/.exec(p);
  if (placement) return `place-${placement[2]}`;
  for (const f of [
    'background',
    'outline',
    'overflow',
    'transition',
    'animation',
    'text-decoration',
    'list-style',
    'mask',
    'columns',
    'column-rule',
    'container',
    'offset',
    'text-emphasis',
    'text-stroke',
    'overscroll-behavior',
    'contain-intrinsic',
  ])
    if (p === f || p.startsWith(`${f}-`)) return f;
  if (/^column-(count|width)$/.test(p)) return 'columns';
  return p;
}

/** Families whose members interact beyond shorthand/longhand (sides, logical vs physical): any two overlap. */
const COARSE = new Set([
  'margin',
  'padding',
  'scroll-margin',
  'scroll-padding',
  'inset',
  'border',
  'border-radius',
  'outline',
  'overflow',
  'columns',
  'column-rule',
  'mask',
  'offset',
  'container',
  'overscroll-behavior',
  'contain-intrinsic',
  'text-emphasis',
  'text-stroke',
]);

/** Longhands a shorthand sets that don't share its name as a prefix. */
const COVERS: Record<string, string[]> = {
  font: ['line-height'],
  gap: ['row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap'],
  'grid-gap': ['grid-row-gap', 'grid-column-gap', 'row-gap', 'column-gap'],
  'grid-area': ['grid-row', 'grid-column', 'grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
};

const unprefixed = (p: string) => p.replace(/^-(webkit|moz|ms|o)-/, '');
const covers = (s: string, l: string) => l.startsWith(`${s}-`) || !!COVERS[s]?.includes(l);

/** Can these two properties set the same thing? (Coarse where it matters: a false yes only keeps CSS.) */
export function overlaps(a: string, b: string): boolean {
  if (a === b || a === 'all' || b === 'all') return true;
  const fa = family(a);
  if (fa !== family(b)) return false;
  if (COARSE.has(fa)) return true;
  const x = unprefixed(a);
  const y = unprefixed(b);
  return x === y || covers(x, y) || covers(y, x);
}
