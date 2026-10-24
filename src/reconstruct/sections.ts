import type { Element, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { USE, useNode, type ComponentDef, type ReconPage } from './ir.js';
import { sectionName } from './naming.js';
import type { Registry } from './registry.js';
import { signature, size } from './signature.js';
import { buildTemplate, canonical, isLossless } from './template.js';
import { eachElement, type Parent } from './walk.js';

const LANDMARKS = new Set(['header', 'footer', 'nav', 'main', 'section', 'aside', 'article']);

/** A component larger than this (elements) is split further. */
const MAX_NODES = 120;
/** Smallest block worth its own file. */
const MIN_NODES = 8;

const elementKids = (n: Root | Element): Element[] =>
  (n.children as { type: string }[]).filter((c) => c.type === 'element') as Element[];
const hasText = (n: Root | Element) => n.children.some((c) => c.type === 'text' && c.value.trim());

/** Skip single-child wrappers (#__next, layout divs) down to where content fans out. */
function fanOut(node: Root | Element): Root | Element {
  let cur = node;
  for (;;) {
    const kids = elementKids(cur);
    if (kids.length !== 1 || hasText(cur) || kids[0].tagName.startsWith('dittu-')) return cur;
    if (!elementKids(kids[0]).length) return cur;
    cur = kids[0];
  }
}

/** Children of `container` worth extracting, expanding `main` and wrappers of several landmarks. */
function candidates(container: Root | Element): { el: Element; parent: Root | Element; inMain: boolean }[] {
  const out: { el: Element; parent: Root | Element; inMain: boolean }[] = [];
  for (const el of elementKids(container)) {
    const kids = elementKids(el);
    const isMain = el.tagName === 'main' || el.properties.role === 'main';
    const wrapsLandmarks = kids.filter((k) => LANDMARKS.has(k.tagName)).length >= 2;
    if ((isMain || wrapsLandmarks) && kids.length >= 2)
      for (const k of kids) out.push({ el: k, parent: el, inMain: isMain });
    else out.push({ el, parent: container, inMain: false });
  }
  return out;
}

const significant = (el: Element, min: number) =>
  !el.tagName.startsWith('dittu-') && (size(el) >= min || toString(el).trim().length >= 80);

export class SectionSplitter {
  /** Identical sections across pages share one component. */
  private byHtml = new Map<string, ComponentDef>();

  constructor(private reg: Registry) {}

  private extract(el: Element, parent: Root | Element, name: string): ComponentDef {
    const key = canonical(el);
    let def = this.byHtml.get(key);
    if (!def) {
      def = this.reg.add({ name: this.reg.unique(name), kind: 'section', root: el, props: [] });
      this.byHtml.set(key, def);
    }
    parent.children[parent.children.indexOf(el)] = useNode(def.name, {});
    return def;
  }

  /** Split a page body into top-level sections, then split oversized ones recursively. */
  splitPage(page: ReconPage): number {
    let count = 0;
    let firstInMain = true;
    const picks = candidates(fanOut(page.root));
    picks.forEach(({ el, parent, inMain }, i) => {
      if (!significant(el, 4)) return;
      const name = sectionName(el, {
        firstInMain: inMain && firstInMain,
        fallback: `${inMain ? 'Section' : 'Block'}${i + 1}`,
      });
      if (inMain) firstInMain = false;
      const def = this.extract(el, parent, name);
      count += 1 + this.splitLarge(def);
    });
    return count;
  }

  /** Break a component that is still too big into named sub-blocks. */
  private splitLarge(def: ComponentDef, depth = 0): number {
    if (depth > 4 || size(def.root) <= MAX_NODES) return 0;
    const container = fanOut(def.root);
    let picks = candidates(container).filter(({ el }) => significant(el, MIN_NODES));
    // one big child: look one level deeper
    if (picks.length === 1 && size(picks[0].el) > MAX_NODES)
      picks = candidates(fanOut(picks[0].el)).filter(({ el }) => significant(el, MIN_NODES));
    if (picks.length < 2) return 0;
    let count = 0;
    const base = def.name.replace(/(Section|Block\d*)$/, '');
    picks.forEach(({ el, parent }, i) => {
      const name = sectionName(el, { firstInMain: false, fallback: `${base}Part${i + 1}` });
      const child = this.extract(el, parent, name === def.name ? `${base}Part${i + 1}` : name);
      count += 1 + this.splitLarge(child, depth + 1);
    });
    return count;
  }

  /**
   * Sections with the same structure but different content (the Hero of two
   * pages) become one component with props instead of Hero and Hero2.
   */
  mergeVariants(roots: Parent[]): number {
    const groups = new Map<string, ComponentDef[]>();
    for (const def of this.reg.components) {
      if (def.kind !== 'section' || def.props.length) continue;
      const s = signature(def.root);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(def);
    }
    let merged = 0;
    for (const defs of groups.values()) {
      if (defs.length < 2) continue;
      const built = buildTemplate(defs.map((d) => d.root));
      if (
        !built ||
        !isLossless(
          built,
          defs.map((d) => d.root),
        )
      )
        continue;
      const [keep, ...rest] = defs;
      keep.root = built.root;
      keep.props = built.props;
      const valuesOf = new Map(defs.map((d, i) => [d.name, built.values[i]]));
      const retarget = (el: Element) => {
        const v = valuesOf.get(String(el.properties.dataComponent));
        if (el.tagName !== USE || !v) return;
        el.properties.dataComponent = keep.name;
        el.properties.dataProps = JSON.stringify(v);
      };
      for (const root of [...roots, ...this.reg.components.map((c) => c.root)]) {
        if (root.type === 'element') retarget(root);
        eachElement(root, (el) => void retarget(el));
      }
      for (const d of rest) this.reg.remove(d);
      merged += rest.length;
    }
    return merged;
  }
}
