import type { Root, Text } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import type { Icon, PageModel } from '../domain/site.js';

const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const attrString = (attrs: [string, string][]) =>
  attrs.map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join('');

export const motionJson = (page: PageModel) => JSON.stringify(page.motion).replace(/</g, '\\u003c');

function headTags(page: PageModel): string {
  const tags = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escText(page.title)}</title>`,
  ];
  if (page.description) tags.push(`<meta name="description" content="${escAttr(page.description)}">`);
  for (const i of page.icons) tags.push(`<link${attrString(iconAttrs(i))}>`);
  tags.push(`<link rel="stylesheet" href="${page.css}">`);
  if (page.tailwindCss) tags.push(`<link rel="stylesheet" href="${page.tailwindCss}">`);
  return tags.join('\n    ');
}

export const iconAttrs = (i: Icon): [string, string][] => [
  ['rel', i.rel],
  ['href', i.href],
  ...(i.type ? ([['type', i.type]] as [string, string][]) : []),
  ...(i.sizes ? ([['sizes', i.sizes]] as [string, string][]) : []),
];

const bodyToHtml = (root: Root) => toHtml(root);

/** Body markup for an .astro template: `{` and `}` in text would start expressions. */
export function bodyToAstro(root: Root): string {
  const copy = structuredClone(root);
  visit(copy, 'text', (t: Text) => {
    t.value = t.value.replace(/\{/g, '').replace(/\}/g, '');
  });
  return toHtml(copy).replace(//g, '&#123;').replace(//g, '&#125;');
}

/** A complete static HTML document (the preview / reference export). */
export function staticDocument(page: PageModel): string {
  return `<!doctype html>
<html${attrString(page.htmlAttrs)}>
  <head>
    ${headTags(page)}
  </head>
  <body${attrString(page.bodyAttrs)}>${bodyToHtml(page.body)}<script type="application/json" id="dittu-motion">${motionJson(page)}</script><script src="/assets/dittu-motion.js" defer></script></body>
</html>
`;
}
