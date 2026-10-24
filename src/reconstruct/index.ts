import type { Element } from 'hast';
import type { SiteModel } from '../domain/site.js';
import { routeScope } from '../domain/site.js';
import { extractIcons } from './icons.js';
import {
  LOOP,
  MAP,
  USE,
  isComponentRef,
  type ComponentDef,
  type PropValue,
  type Reconstruction,
  type ReconPage,
} from './ir.js';
import { Registry } from './registry.js';
import { extractRepeatedBlocks, extractRuns } from './repeats.js';
import { SectionSplitter } from './sections.js';
import { resetSignatures } from './signature.js';

export type { Reconstruction } from './ir.js';

/** Components referenced directly by a tree (uses, maps, component refs in data). */
function references(node: Element | { type: 'root'; children: unknown[] }): Set<string> {
  const out = new Set<string>();
  const addRefs = (v: PropValue) => {
    if (isComponentRef(v)) out.add(v.$component);
    else if (Array.isArray(v)) v.forEach(addRefs);
    else if (v && typeof v === 'object') Object.values(v).forEach(addRefs);
  };
  const visit = (el: Element) => {
    if (el.tagName === USE || el.tagName === MAP || el.tagName === LOOP) {
      if (el.properties.dataComponent) out.add(String(el.properties.dataComponent));
      const data = el.properties.dataProps ?? el.properties.dataItems;
      if (typeof data === 'string') addRefs(JSON.parse(data) as PropValue);
    }
    for (const c of el.children) if (c.type === 'element') visit(c);
  };
  for (const c of (node as Element).children) if ((c as Element).type === 'element') visit(c as Element);
  if ((node as Element).type === 'element') visit(node as Element);
  return out;
}

/** Decide which folder each component goes in: icons/, shared/ (several pages) or the page's own folder. */
function assignScopes(pages: ReconPage[], components: ComponentDef[]) {
  const byName = new Map(components.map((c) => [c.name, c]));
  const refsOf = new Map(components.map((c) => [c.name, references(c.root)]));
  for (const { page, root } of pages) {
    const stack = [...references(root)];
    while (stack.length) {
      const def = byName.get(stack.pop()!);
      if (!def || def.users.has(page.route)) continue;
      def.users.add(page.route);
      stack.push(...(refsOf.get(def.name) ?? []));
    }
  }
  for (const c of components) {
    c.scope = c.kind === 'icon' ? 'icons' : c.users.size > 1 ? 'shared' : routeScope([...c.users][0] ?? '/');
  }
}

/**
 * Reverse-engineer a component structure from captured pages: icons, repeated
 * structures (with props and data arrays), and a section hierarchy. Every
 * extraction is proven lossless against the original markup.
 */
export function reconstructSite(site: SiteModel, opts: { components?: boolean } = {}): Reconstruction {
  resetSignatures();
  const pages: ReconPage[] = site.pages.map((page) => ({ page, root: structuredClone(page.body) }));
  const reg = new Registry();
  if (opts.components === false) {
    return {
      pages,
      components: [],
      stats: { icons: 0, repeats: 0, loops: 0, repeatInstances: 0, sections: 0, skipped: 0 },
    };
  }
  const icons = extractIcons(pages, reg);
  const runs = extractRuns(pages, reg);
  const splitter = new SectionSplitter(reg);
  let sections = 0;
  for (const p of pages) sections += splitter.splitPage(p);
  resetSignatures();
  splitter.mergeVariants(pages.map((p) => p.root));
  resetSignatures();
  const sectionRoots = reg.components.filter((c) => c.kind === 'section').map((c) => c.root);
  const blocks = extractRepeatedBlocks([...pages.map((p) => p.root), ...sectionRoots], reg);
  assignScopes(pages, reg.components);
  // Drop components nothing references (e.g. replaced inside a section deduplicated across pages).
  const components = reg.components.filter((c) => c.users.size);
  return {
    pages,
    components,
    stats: {
      icons,
      repeats: runs.components + blocks.components,
      loops: runs.loops,
      repeatInstances: runs.instances + blocks.instances,
      sections,
      skipped: runs.skipped + blocks.skipped,
    },
  };
}
