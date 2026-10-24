import type { ElementContent, Root } from 'hast';
import { IR_TAGS, USE } from './ir.js';

/**
 * Attributes whose values may differ between instances of one component
 * (they become props). Every other attribute — classes included — must match.
 */
export const CONTENT_ATTRS = new Set([
  'href',
  'src',
  'srcSet',
  'alt',
  'title',
  'ariaLabel',
  'dateTime',
  'poster',
  'value',
  'id',
  'style',
  'width',
  'height',
  'xLinkHref',
  'content',
  'label',
  'placeholder',
  'name',
  'htmlFor',
  'ariaLabelledBy',
  'ariaDescribedBy',
  'ariaControls',
  'dataDittuR',
]);

let cache = new WeakMap<object, string>();

/**
 * Structural fingerprint: tag, classes and non-content attributes, children
 * with runs of identical siblings collapsed (`x*`), text as `T`. Two elements
 * with the same signature can be rendered by one template.
 */
export function signature(node: ElementContent | Root): string {
  if (node.type === 'text') return 'T';
  if (node.type !== 'element' && node.type !== 'root') return '';
  const hit = cache.get(node);
  if (hit !== undefined) return hit;
  let s: string;
  if (node.type === 'root') {
    s = `#root(${childSig(node.children as ElementContent[])})`;
  } else if (node.tagName === USE) {
    // Icons and other uses: which component it is may vary (→ component prop); pass-through attributes may not.
    const { dataComponent: _c, dataProps, ...rest } = node.properties;
    s = `@use{${JSON.stringify(rest)}}${dataProps === '{}' ? '' : '+'}`;
  } else {
    const keys = Object.keys(node.properties).toSorted();
    const attrs = keys.map((k) => (CONTENT_ATTRS.has(k) ? k : `${k}=${JSON.stringify(node.properties[k])}`)).join(',');
    s = `${node.tagName}{${attrs}}(${childSig(node.children)})`;
  }
  cache.set(node, s);
  return s;
}

function childSig(children: ElementContent[]): string {
  const out: string[] = [];
  for (const c of children) {
    const s = signature(c);
    if (!s) continue;
    if (out.length && out[out.length - 1] === s + '*') continue;
    out.push(s + '*');
  }
  return out.join(',');
}

/** Element count, with IR nodes (uses, maps) counting as one. */
export function size(node: ElementContent | Root): number {
  if (node.type !== 'element' && node.type !== 'root') return 0;
  if (node.type === 'element' && IR_TAGS.has(node.tagName)) return 1;
  let n = node.type === 'element' ? 1 : 0;
  for (const c of node.children) n += size(c as ElementContent);
  return n;
}

/** Forget cached signatures after the tree was mutated. */
export function resetSignatures() {
  cache = new WeakMap();
}
