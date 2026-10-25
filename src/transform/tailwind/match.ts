import { compile, type Options } from 'css-select';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { toString } from 'hast-util-to-string';
import selectorParser from 'postcss-selector-parser';
import { find, html, svg } from 'property-information';

type Node = Root | RootContent;
type Adapter = NonNullable<Options<Node, Element>['adapter']>;

/** The page body under synthetic <html> and <body>, so `body .x` and `html.dark .x` match like in the browser. */
export interface Tree {
  root: Root;
  elements: Element[];
  parents: Map<Node, Root | Element>;
}

const toProperties = (attrs: [string, string][], schema = html): Element['properties'] =>
  Object.fromEntries(
    attrs.map(([k, v]) => {
      const info = find(schema, k);
      return [info.property, info.property === 'className' ? v.split(/\s+/).filter(Boolean) : v];
    }),
  );

export function pageTree(body: Root, htmlAttrs: [string, string][], bodyAttrs: [string, string][]): Tree {
  const bodyEl: Element = {
    type: 'element',
    tagName: 'body',
    properties: toProperties(bodyAttrs),
    children: body.children as ElementContent[],
  };
  const htmlEl: Element = { type: 'element', tagName: 'html', properties: toProperties(htmlAttrs), children: [bodyEl] };
  const root: Root = { type: 'root', children: [htmlEl] };
  const parents = new Map<Node, Root | Element>();
  const elements: Element[] = [];
  const visit = (n: Root | Element) => {
    for (const c of n.children) {
      parents.set(c, n);
      if (c.type === 'element') {
        elements.push(c);
        visit(c);
      }
    }
  };
  visit(root);
  return { root, elements, parents };
}

const inSvg = (el: Element, tree: Tree): boolean => {
  for (let n: Node | undefined = el; n && n.type === 'element'; n = tree.parents.get(n)) {
    if (n.tagName === 'svg') return true;
  }
  return false;
};

const childrenOf = (n: Node) => ('children' in n ? (n.children as Node[]) : []);

function adapter(tree: Tree): Adapter {
  const attr = (el: Element, name: string): string | undefined => {
    const info = find(inSvg(el, tree) ? svg : html, name);
    const value = el.properties[info.property];
    if (value === undefined || value === null || value === false) return undefined;
    if (value === true) return '';
    return Array.isArray(value) ? value.join(info.commaSeparated ? ',' : ' ') : String(value);
  };
  return {
    isTag: (n): n is Element => n.type === 'element',
    getAttributeValue: attr,
    getChildren: childrenOf,
    getName: (el) => el.tagName,
    getParent: (el) => tree.parents.get(el) ?? null,
    getSiblings: (n) => {
      const p = tree.parents.get(n);
      return p ? (p.children as Node[]) : [n];
    },
    getText: (n) => toString(n as Element),
    hasAttrib: (el, name) => attr(el, name) !== undefined,
    removeSubsets: (nodes) => nodes,
    // Interaction states are assumed possible.
    isHovered: () => true,
    isActive: () => true,
    isVisited: () => true,
  };
}

/** Pseudo-classes that depend on interaction; dropped before matching (= assume they can apply). */
const DYNAMIC =
  /^:(focus|focus-visible|focus-within|target|autofill|-webkit-autofill|user-invalid|user-valid|popover-open|open|modal|fullscreen|playing|paused)$/i;

/** A selector rewritten to match the element regardless of interaction state, or null when it targets a pseudo-element. */
function staticSelector(selector: string): string | null {
  let pseudoElement = false;
  const out = selectorParser((root) => {
    root.walkPseudos((p) => {
      const name = p.value.toLowerCase();
      if (name.startsWith('::') || [':before', ':after', ':first-line', ':first-letter'].includes(name)) {
        pseudoElement = true;
      } else if (DYNAMIC.test(name)) {
        const parent = p.parent;
        p.remove();
        if (parent && parent.nodes.length === 0) parent.append(selectorParser.universal({ value: '*' }));
      }
    });
  }).processSync(selector);
  return pseudoElement ? null : out;
}

export type Matcher = (el: Element) => boolean;

/** Compile a selector against the tree. Unknown syntax matches everything (the safe answer). */
export function matcher(selector: string, tree: Tree): Matcher | null {
  let stat: string | null;
  try {
    stat = staticSelector(selector);
  } catch {
    return () => true;
  }
  if (stat === null) return null;
  try {
    const query = compile<Node, Element>(stat, { adapter: adapter(tree), xmlMode: false });
    return (el) => query(el);
  } catch {
    return () => true;
  }
}
