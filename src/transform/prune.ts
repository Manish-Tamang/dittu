import type { Element, Root } from 'hast';
import { parse, type AtRule, type Root as CssRoot } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { find, html, svg } from 'property-information';

export interface Tokens {
  classes: Set<string>;
  ids: Set<string>;
  tags: Set<string>;
  attrs: Set<string>;
  /** Inline style text, scanned for animation / font-family references. */
  inline: string[];
}

/** Everything a selector could refer to, collected from the page markup. */
export function collectTokens(body: Root, rootAttrs: [string, string][], extraClasses: string[] = []): Tokens {
  const t: Tokens = {
    classes: new Set(extraClasses),
    ids: new Set(),
    tags: new Set(['html', 'body', ':root']),
    attrs: new Set(),
    inline: [],
  };
  for (const [name, value] of rootAttrs) {
    t.attrs.add(name.toLowerCase());
    if (name === 'class')
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => t.classes.add(c));
    if (name === 'id') t.ids.add(value);
    if (name === 'style') t.inline.push(value);
  }
  const visit = (n: Root | Element, inSvg: boolean) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      const isSvg = inSvg || c.tagName === 'svg';
      t.tags.add(c.tagName.toLowerCase());
      for (const [key, value] of Object.entries(c.properties)) {
        t.attrs.add(find(isSvg ? svg : html, key).attribute.toLowerCase());
        if (key === 'className' && Array.isArray(value)) value.forEach((v) => t.classes.add(String(v)));
        if (key === 'id') t.ids.add(String(value));
        if (key === 'style') t.inline.push(String(value));
      }
      visit(c, isSvg);
    }
  };
  visit(body, false);
  return t;
}

/** Could this selector match something in the page? (Presence of every class/id/tag/attribute it names.) */
function selectorMatches(selector: string, t: Tokens): boolean {
  let ok = true;
  try {
    selectorParser((root) => {
      root.each((sel) => {
        // Functional pseudos (:not, :is, :has, …) are left alone: conservative keep.
        sel.each((node) => {
          if (node.type === 'class' && !t.classes.has(node.value)) ok = false;
          else if (node.type === 'id' && !t.ids.has(node.value)) ok = false;
          else if (node.type === 'tag' && node.value !== '*' && !t.tags.has(node.value.toLowerCase())) ok = false;
          else if (node.type === 'attribute' && !t.attrs.has(node.attribute.toLowerCase())) ok = false;
        });
      });
    }).processSync(selector);
  } catch {
    return true;
  }
  return ok;
}

const attributeNames = (selector: string): string[] => {
  const out: string[] = [];
  try {
    selectorParser((root) => root.walkAttributes((a) => void out.push(a.attribute.toLowerCase()))).processSync(
      selector,
    );
  } catch {}
  return out;
};

export interface PruneResult {
  css: string;
  /** Attribute names that remaining selectors refer to (other data-* attributes can go). */
  attrsUsed: Set<string>;
  removedRules: number;
}

/**
 * Remove rules that can't match anything in the page, then @keyframes and
 * @font-face nothing refers to. Selector lists are never edited: a browser
 * drops a whole rule when one selector in the list is invalid, so trimming a
 * list could make a dead rule apply.
 */
export function pruneCss(css: string, t: Tokens): PruneResult {
  const root: CssRoot = parse(css);
  let removedRules = 0;
  root.walkRules((rule) => {
    const parent = rule.parent as AtRule | undefined;
    if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    if (!rule.selectors.some((s) => selectorMatches(s, t))) {
      rule.remove();
      removedRules++;
    }
  });

  // Names referenced by any remaining declaration (custom properties included) or inline style.
  const values: string[] = [...t.inline];
  root.walkDecls((d) => {
    const parent = d.parent?.parent as AtRule | undefined;
    if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    if (d.parent?.type === 'atrule' && (d.parent as AtRule).name.toLowerCase() === 'font-face') return;
    values.push(d.value);
  });
  const haystack = values.join('\n').toLowerCase();
  const referenced = (name: string) => {
    const n = name
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();
    return (
      n.length > 0 && new RegExp(`(^|[^\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`).test(haystack)
    );
  };
  root.walkAtRules((at) => {
    const name = at.name.toLowerCase();
    if (name.endsWith('keyframes') && !referenced(at.params)) {
      at.remove();
      removedRules++;
    } else if (name === 'font-face') {
      let family = '';
      at.walkDecls('font-family', (d) => void (family = d.value));
      if (family && !referenced(family)) {
        at.remove();
        removedRules++;
      }
    }
  });
  // Drop emptied @media / @supports / @layer blocks (not `@layer a, b;` statements).
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((at) => {
      if (at.nodes && at.nodes.length === 0) {
        at.remove();
        changed = true;
      }
    });
  }

  const attrsUsed = new Set<string>();
  root.walkRules((rule) => rule.selectors.forEach((s) => attributeNames(s).forEach((a) => attrsUsed.add(a))));
  return { css: root.toString(), attrsUsed, removedRules };
}

const KEEP_DATA = new Set(['data-dittu-m', 'data-dittu-r']);

/** Remove data-* attributes nothing refers to (framework/analytics leftovers like data-nimg, data-sentry-*). */
export function cleanupAttributes(body: Root, attrsUsed: Set<string>): number {
  let removed = 0;
  const visit = (n: Root | Element, inSvg: boolean) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      const isSvg = inSvg || c.tagName === 'svg';
      // style="" left behind by animations renders nothing.
      if (c.properties.style === '' && !attrsUsed.has('style')) {
        delete c.properties.style;
        removed++;
      }
      for (const key of Object.keys(c.properties)) {
        if (!key.startsWith('data')) continue;
        const attr = find(isSvg ? svg : html, key).attribute.toLowerCase();
        if (!attr.startsWith('data-') || KEEP_DATA.has(attr) || attrsUsed.has(attr)) continue;
        delete c.properties[key];
        removed++;
      }
      visit(c, isSvg);
    }
  };
  visit(body, false);
  return removed;
}
