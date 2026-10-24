import type { Element } from 'hast';
import { toString } from 'hast-util-to-string';
import { pascal } from '../util/naming.js';

/** Utility-class families (Tailwind and friends): `flex`, `flex-col`, `text-sm`, `-mt-2`, … */
const UTILITY = new RegExp(
  '^-?(?:flex|grid|block|inline|hidden|contents|table|relative|absolute|fixed|sticky|static|visible|invisible|' +
    'container|sr|not|group|peer|isolate|truncate|underline|overline|uppercase|lowercase|capitalize|italic|antialiased|' +
    'grow|shrink|transform|transition|filter|blur|shadow|rounded|border|outline|ring|text|bg|from|via|to|fill|stroke|' +
    'p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|w|h|min|max|size|gap|space|font|leading|tracking|items|justify|' +
    'content|self|place|overflow|overscroll|z|top|left|right|bottom|inset|start|end|opacity|duration|delay|ease|animate|' +
    'translate|scale|rotate|skew|origin|cursor|select|pointer|resize|scroll|snap|touch|will|col|row|order|basis|object|' +
    'aspect|columns|break|decoration|indent|align|whitespace|list|divide|backdrop|mix|line|clamp|tabular|slashed|' +
    'ordinal|accent|caret|appearance|drop|hue|invert|saturate|sepia|brightness|contrast|grayscale|caption|float|clear|' +
    'box|display|shadow|dark|light|motion|print|portrait|landscape|first|last|odd|even|hover|focus|active|disabled)(?:-.*)?$',
);

/** CSS-module class: `ProjectCard_title__x7Yz` → ["ProjectCard", "title"]. */
const CSS_MODULE = /^([A-Za-z][A-Za-z0-9]*)_([A-Za-z][A-Za-z0-9-]*)__[A-Za-z0-9_-]{4,}$/;

const classList = (el: Element): string[] =>
  Array.isArray(el.properties.className) ? el.properties.className.map(String) : [];

/** Class names that describe the element (not utilities, not hashes). */
function semanticNames(el: Element): string[] {
  const out: string[] = [];
  for (const c of classList(el)) {
    const mod = CSS_MODULE.exec(c);
    if (mod) {
      out.push(mod[2] === 'root' || mod[2] === 'wrapper' || mod[2] === 'container' ? mod[1] : `${mod[1]} ${mod[2]}`);
      continue;
    }
    if (/[:[\]/.#!@%]|\d/.test(c) || c.length < 4 || UTILITY.test(c) || /^(sc|css|jsx|svelte|astro|emotion)-/.test(c))
      continue;
    if (/^[a-z]+(?:[-_][a-z]+)*$/i.test(c)) out.push(c.replace(/[-_]+/g, ' '));
  }
  return out;
}

export function firstHeading(el: Element, maxDepth = 6): Element | null {
  const walk = (e: Element, d: number): Element | null => {
    if (d > maxDepth) return null;
    for (const c of e.children) {
      if (c.type !== 'element') continue;
      if (/^h[1-6]$/.test(c.tagName)) return c;
      const hit = walk(c, d + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(el, 0);
}

const has = (el: Element, test: (e: Element) => boolean): boolean =>
  el.children.some((c) => c.type === 'element' && (test(c) || has(c, test)));

const words = (s: string, n: number) =>
  s
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .join(' ');

const GENERIC = new Set([
  'card',
  'item',
  'tile',
  'entry',
  'box',
  'row',
  'cell',
  'block',
  'element',
  'wrapper',
  'container',
  'list item',
  'grid item',
]);

/** Name for a component rendered repeatedly (cards, list items, links). */
export function repeatName(el: Element, context?: Element): string {
  const ctxHeading = context ? firstHeading(context, 3) : null;
  const prefix = ctxHeading ? pascal(words(toString(ctxHeading), 2)) : '';
  const usablePrefix = prefix.length > 24 ? '' : prefix;
  const semantic = semanticNames(el)[0];
  // The author's own class name wins; generic ones ("card") get the section's heading in front.
  if (semantic) return (GENERIC.has(semantic.toLowerCase()) ? usablePrefix : '') + pascal(semantic);
  const hasImg = has(el, (e) => e.tagName === 'img' || e.tagName === 'picture' || e.tagName === 'video');
  const hasHeading = has(el, (e) => /^h[1-6]$/.test(e.tagName));
  let role: string;
  if (el.tagName === 'tr') role = 'Row';
  else if (hasImg && hasHeading) role = 'Card';
  else if (hasHeading) role = 'Feature';
  else if (el.tagName === 'a') role = context?.tagName === 'nav' || hasAncestorNav(context) ? 'NavLink' : 'Link';
  else if (el.tagName === 'button') role = 'Button';
  else if (el.tagName === 'li') role = 'Item';
  else if (hasImg || el.tagName === 'img' || has(el, (e) => e.tagName === USE_ICON)) role = 'Logo';
  else role = 'Item';
  return usablePrefix + role;
}

const USE_ICON = 'dittu-use';
const hasAncestorNav = (el?: Element) => Boolean(el && (el.tagName === 'nav' || el.properties.role === 'navigation'));

const FIXED: Record<string, string> = {
  header: 'Header',
  footer: 'Footer',
  nav: 'Nav',
  aside: 'Sidebar',
  form: 'Form',
};

/** Name for a section / block extracted from a page or a larger component. */
export function sectionName(el: Element, opts: { firstInMain: boolean; fallback: string }): string {
  if (FIXED[el.tagName]) return FIXED[el.tagName];
  const role = String(el.properties.role ?? '');
  if (role === 'banner') return 'Header';
  if (role === 'contentinfo') return 'Footer';
  if (role === 'navigation') return 'Nav';
  const semantic = semanticNames(el)[0];
  if (semantic) return pascal(semantic);
  const id = typeof el.properties.id === 'string' ? el.properties.id : '';
  if (id && !/^[:\d]|^radix-|^headlessui-|^__|^r[0-9a-z]{1,3}$/i.test(id) && id.length < 40) {
    const n = pascal(id);
    if (n) return /section$/i.test(n) ? n : n + 'Section';
  }
  const label = typeof el.properties.ariaLabel === 'string' ? el.properties.ariaLabel : '';
  if (label) return pascal(words(label, 3)) + 'Section';
  const heading = firstHeading(el);
  if (heading) {
    if (opts.firstInMain && heading.tagName === 'h1') return 'Hero';
    const n = pascal(words(toString(heading), 3));
    if (n) return n + 'Section';
  }
  return opts.fallback;
}

/** Name for an inline SVG turned into an icon component. */
export function iconName(svg: Element, parent?: Element): string {
  const cls = classList(svg);
  for (const c of cls) {
    const m = /^(?:lucide|tabler|heroicon|icon|fa|bi|ri|mdi|ph|feather)[-_](.+)$/.exec(c);
    if (m && !/^(icon|lucide|outline|solid|regular|fill)$/.test(m[1])) return pascal(m[1]) + 'Icon';
  }
  const title = svg.children.find((c): c is Element => c.type === 'element' && c.tagName === 'title');
  const label =
    (typeof svg.properties.ariaLabel === 'string' && svg.properties.ariaLabel) ||
    (title && toString(title)) ||
    (typeof svg.properties.dataIcon === 'string' && svg.properties.dataIcon) ||
    (parent && typeof parent.properties.ariaLabel === 'string' && parent.properties.ariaLabel) ||
    (parent && ['a', 'button'].includes(parent.tagName) && toString(parent).trim()) ||
    '';
  const base = pascal(words(label || linkHint(parent), 3));
  const large = (Number(svg.properties.width) || 0) > 64 || countElements(svg) > 40;
  if (base) return base + (large ? 'Graphic' : 'Icon');
  return large ? 'Graphic' : 'Icon';
}

const SOCIAL: [RegExp, string][] = [
  [/github\.com/, 'Github'],
  [/(twitter|x)\.com/, 'X'],
  [/linkedin\.com/, 'Linkedin'],
  [/instagram\.com/, 'Instagram'],
  [/youtube\.com|youtu\.be/, 'Youtube'],
  [/facebook\.com/, 'Facebook'],
  [/discord\.(gg|com)/, 'Discord'],
  [/dribbble\.com/, 'Dribbble'],
  [/behance\.net/, 'Behance'],
  [/medium\.com/, 'Medium'],
  [/threads\.net/, 'Threads'],
  [/bsky\.app/, 'Bluesky'],
  [/t\.me|telegram/, 'Telegram'],
  [/wa\.me|whatsapp/, 'Whatsapp'],
  [/spotify\.com/, 'Spotify'],
  [/^mailto:/, 'Mail'],
  [/^tel:/, 'Phone'],
  [/\/rss|\.xml$|feed/, 'Rss'],
];

/** Where the icon's link goes, or its title: "github.com/…" → "Github". */
function linkHint(parent?: Element): string {
  if (!parent) return '';
  if (typeof parent.properties.title === 'string') return parent.properties.title;
  const href = typeof parent.properties.href === 'string' ? parent.properties.href : '';
  for (const [re, name] of SOCIAL) if (re.test(href)) return name;
  return '';
}

const countElements = (el: Element): number =>
  1 + el.children.reduce((n, c) => n + (c.type === 'element' ? countElements(c) : 0), 0);

const PLURAL_IRREGULAR: Record<string, string> = { Person: 'people', Child: 'children' };

/** "ProjectCard" → "projectCards" (data array name), "projectCard" (loop variable). */
export function collectionNames(component: string): { list: string; item: string } {
  const item = component[0].toLowerCase() + component.slice(1);
  const last = /[A-Z][a-z0-9]*$/.exec(component)?.[0] ?? component;
  const head = component.slice(0, component.length - last.length);
  const plural =
    PLURAL_IRREGULAR[last] ??
    (/(s|x|z|ch|sh)$/.test(last) ? last + 'es' : /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : last + 's');
  const list = head
    ? head[0].toLowerCase() + head.slice(1) + plural[0].toUpperCase() + plural.slice(1)
    : plural.toLowerCase();
  return { list, item };
}

/** Prop name for a varying text node or attribute, from where it sits. */
export function slotName(path: Element[], attr: string | null): string {
  const el = path[path.length - 1];
  if (attr) {
    if (attr === 'src') return el.tagName === 'img' ? 'image' : el.tagName === 'video' ? 'video' : 'src';
    if (attr === 'srcSet') return 'srcSet';
    if (attr === 'alt') return 'imageAlt';
    if (attr === 'ariaLabel') return 'ariaLabel';
    if (attr === 'dataDittuR') return 'layout';
    return attr;
  }
  const tags = path.map((e) => e.tagName);
  if (tags.some((t) => /^h[1-6]$/.test(t))) return 'title';
  if (tags.includes('time')) return 'date';
  if (tags.includes('button')) return 'label';
  if (tags.includes('a')) return 'label';
  if (tags.includes('p') || tags.includes('blockquote')) return 'description';
  if (tags.includes('li')) return 'text';
  const sem = semanticNames(el)[0];
  if (sem) {
    const n = pascal(sem);
    return n[0].toLowerCase() + n.slice(1);
  }
  return 'text';
}
