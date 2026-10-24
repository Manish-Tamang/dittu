import { fromHtml } from 'hast-util-from-html';
import { describe, expect, it } from 'vitest';
import { cleanupAttributes, collectTokens, pruneCss } from './prune.js';

const body = () =>
  fromHtml(
    '<div class="card" data-state="open" data-nimg="1" style=""><h2 id="t">Hi</h2><span style="animation: pulse 1s">x</span></div>',
    {
      fragment: true,
    },
  );

const CSS = `
.card { color: red }
.unused { color: blue }
.unused, .card:hover { color: green }
#t { margin: 0 }
#missing { margin: 0 }
[data-state=open] { display: block }
[data-other] { display: none }
@media (min-width: 1px) { .gone { color: red } }
@keyframes pulse { to { opacity: 0 } }
@keyframes spin { to { rotate: 1turn } }
@font-face { font-family: "Used"; src: url(a.woff2) }
@font-face { font-family: "Unused"; src: url(b.woff2) }
:root { --font: "Used", sans-serif }
`;

describe('pruneCss', () => {
  const b = body();
  const result = pruneCss(CSS, collectTokens(b, [['class', 'dark']]));

  it('removes rules that cannot match and keeps the rest untouched', () => {
    expect(result.css).toContain('.card { color: red }');
    expect(result.css).not.toContain('.unused { color: blue }');
    expect(result.css).toContain('.unused, .card:hover'); // lists are never trimmed
    expect(result.css).toContain('#t');
    expect(result.css).not.toContain('#missing');
    expect(result.css).toContain('[data-state=open]');
    expect(result.css).not.toContain('[data-other]');
    expect(result.css).not.toContain('@media');
  });

  it('keeps keyframes and font faces only when referenced (inline styles and custom properties count)', () => {
    expect(result.css).toContain('@keyframes pulse');
    expect(result.css).not.toContain('@keyframes spin');
    expect(result.css).toContain('"Used"');
    expect(result.css).not.toContain('"Unused"');
  });

  it('drops data-* attributes nothing refers to, and empty styles', () => {
    expect(cleanupAttributes(b, result.attrsUsed)).toBe(2);
    const div = b.children[0] as { properties: Record<string, unknown> };
    expect(div.properties).toEqual({ className: ['card'], dataState: 'open' });
  });
});
