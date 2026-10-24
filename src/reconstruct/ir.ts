// Intermediate representation: a hast tree with a few marker nodes that the
// Next.js and Astro writers turn into their own syntax.

import type { Element } from 'hast';
import type { PageModel } from '../domain/site.js';

/** `<Component {...props} />` — properties: dataComponent, dataProps (JSON), plus pass-through attributes for icons. */
export const USE = 'dittu-use';
/** `{items.map((item) => <Component {...item} />)}` — dataComponent, dataVar, dataItems (JSON). */
export const MAP = 'dittu-map';
/** Inline loop for small repeated items: `{items.map((item) => <li>{item}</li>)}` — dataVar, dataItem, dataItems (JSON), dataType (JSON PropType); one child: the item template. */
export const LOOP = 'dittu-loop';
/** `{title}` inside a component template — dataPath. */
export const SLOT = 'dittu-slot';
/** `{tags.map((tag) => …)}` inside a template — dataPath (array prop), dataItem (loop variable); one child: the item template. */
export const EACH = 'dittu-each';
/** Attribute value `"path"` → `attr={path}`. */
export const MARK = '';
/** Style slot: `style={path}` (kept out of `style` so it isn't parsed as CSS). */
export const STYLE_SLOT = 'dataDittuStyleSlot';

export const IR_TAGS = new Set([USE, MAP, LOOP, SLOT, EACH]);

export const SLOT_RE = new RegExp(`^${MARK}([\\w.]+)${MARK}$`);

/** A component reference as a prop value (e.g. `icon: GithubIcon`). */
export interface ComponentRef {
  $component: string;
}

export type PropValue = string | ComponentRef | PropValue[] | { [key: string]: PropValue };

export type PropType =
  | { kind: 'string' }
  | { kind: 'style' }
  | { kind: 'component' }
  | { kind: 'list'; item: PropDef[] | 'string' };

export interface PropDef {
  name: string;
  type: PropType;
}

type ComponentKind = 'section' | 'repeat' | 'icon';

export interface ComponentDef {
  /** Identifier, unique across the site. */
  name: string;
  kind: ComponentKind;
  /** Folder under components/: a page scope, "shared", or "icons". */
  scope: string;
  /** Template root. */
  root: Element;
  props: PropDef[];
  /** Routes that use it (directly or through another component). */
  users: Set<string>;
}

export interface ReconPage {
  page: PageModel;
  /** Page body with IR nodes. */
  root: import('hast').Root;
}

export interface Reconstruction {
  pages: ReconPage[];
  components: ComponentDef[];
  stats: { icons: number; repeats: number; loops: number; repeatInstances: number; sections: number; skipped: number };
}

export const isComponentRef = (v: unknown): v is ComponentRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && '$component' in v;

export const useNode = (
  component: string,
  props: Record<string, PropValue>,
  extra: Element['properties'] = {},
): Element => ({
  type: 'element',
  tagName: USE,
  properties: { ...extra, dataComponent: component, dataProps: JSON.stringify(props) },
  children: [],
});
