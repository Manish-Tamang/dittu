import type { Element } from 'hast';
import { USE, type ReconPage } from './ir.js';
import { iconName } from './naming.js';
import type { Registry } from './registry.js';
import { canonical } from './template.js';
import { eachElement } from './walk.js';

/** Root attributes that belong to the use site (size, styling, accessibility), not the icon itself. */
const INSTANCE_PROPS = new Set([
  'className',
  'style',
  'width',
  'height',
  'ariaHidden',
  'ariaLabel',
  'role',
  'focusable',
  'id',
  'dataDittuM',
  'dataDittuR',
]);

/** Every distinct inline SVG becomes an icon component; identical ones share it. */
export function extractIcons(pages: ReconPage[], reg: Registry): number {
  const groups = new Map<
    string,
    { svg: Element; original: Element; parent: Element | undefined; sites: [Element[], number][] }
  >();
  for (const { root } of pages) {
    eachElement(root, (el, parent, index) => {
      if (el.tagName !== 'svg' || !el.children.some((c) => c.type === 'element')) return;
      const body: Element = {
        ...el,
        properties: Object.fromEntries(Object.entries(el.properties).filter(([k]) => !INSTANCE_PROPS.has(k))),
      };
      const key = canonical(body);
      let g = groups.get(key);
      if (!g) {
        g = { svg: body, original: el, parent: parent.type === 'element' ? parent : undefined, sites: [] };
        groups.set(key, g);
      }
      g.sites.push([parent.children as Element[], index]);
      return 'skip';
    });
  }
  for (const g of groups.values()) {
    // Name from the original (its class, e.g. "lucide-github", is a use-site attribute and was stripped from the body).
    const def = reg.add({ name: reg.unique(iconName(g.original, g.parent)), kind: 'icon', root: g.svg, props: [] });
    for (const [siblings, index] of g.sites) {
      const svg = siblings[index];
      const passThrough = Object.fromEntries(Object.entries(svg.properties).filter(([k]) => INSTANCE_PROPS.has(k)));
      siblings[index] = {
        type: 'element',
        tagName: USE,
        properties: { ...passThrough, dataComponent: def.name, dataProps: '{}' },
        children: [],
      };
    }
  }
  return groups.size;
}
