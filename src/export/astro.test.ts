import { fromHtml } from 'hast-util-from-html';
import { describe, expect, it } from 'vitest';
import type { ComponentDef } from '../reconstruct/ir.js';
import { USE } from '../reconstruct/ir.js';
import { AstroWriter } from './astro.js';
import { newJsxContext } from './jsx.js';

const write = (html: string, components = new Map<string, ComponentDef>()) =>
  new AstroWriter(newJsxContext(components, false), new Map()).tree(fromHtml(html, { fragment: true }));

describe('AstroWriter', () => {
  it('uses SVG attribute names and self-closes empty SVG elements (including <image>)', () => {
    const out = write(
      '<svg viewBox="0 0 2 2"><circle r="1" stroke-width="2"></circle><image href="/a.png" clip-path="url(#c)"></image></svg>',
    );
    expect(out).toBe(
      '<svg viewBox="0 0 2 2"><circle r="1" stroke-width="2" /><image href="/a.png" clip-path="url(#c)" /></svg>',
    );
  });

  it('escapes braces in text and keeps HTML void elements void', () => {
    expect(write('<p>Hi {name}<br>there</p>')).toBe('<p>Hi &#123;name&#125;<br>there</p>');
  });

  it('passes plain strings as attributes and anything special as expressions', () => {
    const out = write(
      `<${USE} data-component="Hero" data-props='{"title":"Hard {cases} &amp; more","label":"Plain"}'></${USE}>`,
    );
    expect(out).toBe('<Hero title={"Hard {cases} & more"} label="Plain" />');
  });
});
