import type { Element } from 'hast';
import { LOOP, MAP, useNode, type PropType, type ReconPage } from './ir.js';
import { collectionNames, firstHeading, repeatName } from './naming.js';
import type { Registry } from './registry.js';
import { resetSignatures, signature, size } from './signature.js';
import { buildTemplate, isLossless } from './template.js';
import { eachElement, isInside, parentMap, type Parent } from './walk.js';

interface Run {
  parent: Parent;
  start: number;
  count: number;
  sig: string;
  route: string;
  ancestors: Parent[];
}

const LANDMARK = new Set(['section', 'article', 'header', 'footer', 'nav', 'aside', 'main']);

const contains = (root: Element, target: unknown): boolean =>
  root === target || root.children.some((c) => c.type === 'element' && contains(c, target));

/**
 * A heading that introduces the repeated items ("Projects" → ProjectsCard):
 * before them, in the parent or grandparent, and not inside another landmark.
 */
function contextFor(run: Run): Element | undefined {
  const first = run.parent.children[run.start];
  for (const a of [run.parent, ...run.ancestors.slice(0, 1)]) {
    if (a.type !== 'element') continue;
    for (const c of a.children) {
      if (c.type !== 'element') continue;
      if (c === first || contains(c, first)) break;
      if (/^h[1-6]$/.test(c.tagName)) return { ...a, children: [c] };
      if (LANDMARK.has(c.tagName)) continue;
      const h = firstHeading(c, 2);
      if (h) return { ...a, children: [h] };
    }
  }
  return undefined;
}

function collectRuns(page: ReconPage): Run[] {
  const runs: Run[] = [];
  const stack: Parent[] = [];
  const visit = (parent: Parent) => {
    const kids = parent.children;
    for (let i = 0; i < kids.length;) {
      const c = kids[i];
      if (c.type !== 'element') {
        i++;
        continue;
      }
      const s = signature(c);
      let j = i + 1;
      while (j < kids.length && kids[j].type === 'element' && signature(kids[j] as Element) === s) j++;
      if (j - i >= 2 && c.tagName !== MAP)
        runs.push({ parent, start: i, count: j - i, sig: s, route: page.page.route, ancestors: stack.toReversed() });
      i = j;
    }
    stack.push(parent);
    for (const c of kids) if (c.type === 'element' && c.tagName !== 'svg' && !c.tagName.startsWith('dittu-')) visit(c);
    stack.pop();
  };
  visit(page.root);
  return runs;
}

export interface RepeatStats {
  components: number;
  loops: number;
  instances: number;
  skipped: number;
}

/**
 * Runs of identical sibling structures (cards, list items, logos) become one
 * component rendered with `.map()` over a data array. Groups are shared across
 * pages. Each group must expand back to the exact original markup.
 */
export function extractRuns(pages: ReconPage[], reg: Registry): RepeatStats {
  const stats: RepeatStats = { components: 0, loops: 0, instances: 0, skipped: 0 };
  const bySig = new Map<string, Run[]>();
  for (const run of pages.flatMap(collectRuns)) {
    if (!bySig.has(run.sig)) bySig.set(run.sig, []);
    bySig.get(run.sig)!.push(run);
  }
  const itemSize = (r: Run) => size(r.parent.children[r.start] as Element);
  // Largest items first: lists inside an extracted item become list props of its template.
  const order = [...bySig.values()].toSorted((a, b) => itemSize(b[0]) - itemSize(a[0]));

  const parents = new Map<Element, Parent>();
  for (const p of pages) for (const [k, v] of parentMap(p.root)) parents.set(k, v);
  const taken = new Set<Element>();
  const replacements: { run: Run; node: Element }[] = [];
  for (const group of order) {
    const runs = group.filter((r) => {
      const first = r.parent.children[r.start] as Element;
      return !taken.has(first) && !isInside(first, taken, parents) && (itemSize(r) >= 2 || r.count >= 3);
    });
    if (!runs.length) continue;
    const instances = runs.flatMap((r) => r.parent.children.slice(r.start, r.start + r.count) as Element[]);
    const role = repeatName(instances[0], contextFor(runs[0]));
    // Small items (a link, a tag, a slide) read best as an inline loop, not a component file.
    const inline = size(instances[0]) <= 3;
    const { list, item } = collectionNames(role);
    const built = buildTemplate(instances, inline ? item : undefined);
    if (!built || !built.props.length || !isLossless(built, instances, inline ? item : undefined)) {
      stats.skipped++;
      continue;
    }
    for (const it of instances) taken.add(it);
    let name = '';
    if (!inline) {
      name = reg.unique(role);
      reg.add({ name, kind: 'repeat', root: built.root, props: built.props });
    }
    const itemType: PropType = { kind: 'list', item: built.primitive ? 'string' : built.props };
    let offset = 0;
    for (const run of runs) {
      const values = built.values.slice(offset, offset + run.count);
      offset += run.count;
      replacements.push({
        run,
        node: inline
          ? {
              type: 'element',
              tagName: LOOP,
              properties: {
                dataVar: list,
                dataItem: item,
                dataItems: JSON.stringify(values.map((v) => (built.primitive ? v[item] : v))),
                dataType: JSON.stringify(itemType),
              },
              children: [structuredClone(built.root)],
            }
          : {
              type: 'element',
              tagName: MAP,
              properties: { dataComponent: name, dataVar: list, dataItems: JSON.stringify(values) },
              children: [],
            },
      });
    }
    if (inline) stats.loops++;
    else stats.components++;
    stats.instances += instances.length;
  }
  // Splice from the end so earlier indices stay valid.
  replacements.sort((a, b) => b.run.start - a.run.start);
  for (const { run, node } of replacements) run.parent.children.splice(run.start, run.count, node);
  resetSignatures();
  return stats;
}

/**
 * Larger identical structures used in several places (not side by side) —
 * inside pages and inside component templates — become shared components with props.
 */
export function extractRepeatedBlocks(roots: Parent[], reg: Registry, minSize = 6): RepeatStats {
  const stats: RepeatStats = { components: 0, loops: 0, instances: 0, skipped: 0 };
  const groups = new Map<string, { el: Element; parent: Parent }[]>();
  for (const root of roots) {
    eachElement(root, (el, parent) => {
      if (el.tagName.startsWith('dittu-') || el.tagName === 'svg' || size(el) < minSize) return;
      const s = signature(el);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push({ el, parent });
    });
  }
  const candidates = [...groups.values()]
    .filter((g) => g.length >= 2)
    .toSorted((a, b) => size(b[0].el) - size(a[0].el));
  const parents = new Map<Element, Parent>();
  for (const root of roots) for (const [k, v] of parentMap(root)) parents.set(k, v);
  const taken = new Set<Element>();
  for (const group of candidates) {
    const free = group.filter(({ el }) => !taken.has(el) && !isInside(el, taken, parents));
    // overlapping occurrences (one inside another) can't both be replaced
    const occ = free.filter(({ el }) => !free.some((o) => o.el !== el && isInside(el, new Set([o.el]), parents)));
    if (occ.length < 2) continue;
    const instances = occ.map((o) => o.el);
    const built = buildTemplate(instances);
    if (!built || !built.props.length || !isLossless(built, instances)) {
      stats.skipped++;
      continue;
    }
    const name = reg.unique(repeatName(instances[0]));
    reg.add({ name, kind: 'repeat', root: built.root, props: built.props });
    occ.forEach(({ el, parent }, i) => {
      const idx = parent.children.indexOf(el);
      parent.children[idx] = useNode(name, built.values[i]);
      taken.add(el);
    });
    stats.components++;
    stats.instances += occ.length;
  }
  resetSignatures();
  return stats;
}
