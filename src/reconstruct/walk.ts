import type { Element, ElementContent, Root } from 'hast';
import { IR_TAGS } from './ir.js';

export type Parent = Root | Element;

/**
 * Visit elements depth-first with their parent. Doesn't enter IR nodes or
 * SVG internals (icons are handled as a whole).
 */
export function eachElement(root: Parent, fn: (el: Element, parent: Parent, index: number) => void | 'skip') {
  const visit = (parent: Parent) => {
    for (let i = 0; i < parent.children.length; i++) {
      const c = parent.children[i] as ElementContent;
      if (c.type !== 'element') continue;
      if (fn(c, parent, i) === 'skip') continue;
      if (IR_TAGS.has(c.tagName) || c.tagName === 'svg') continue;
      visit(c);
    }
  };
  visit(root);
}

/** Map each element to its parent (for ancestor checks). */
export function parentMap(root: Parent): Map<Element, Parent> {
  const map = new Map<Element, Parent>();
  eachElement(root, (el, parent) => {
    map.set(el, parent);
  });
  return map;
}

export function isInside(el: Element, ancestors: Set<Element>, parents: Map<Element, Parent>): boolean {
  let cur: Parent | undefined = parents.get(el);
  while (cur && cur.type === 'element') {
    if (ancestors.has(cur)) return true;
    cur = parents.get(cur);
  }
  return false;
}
