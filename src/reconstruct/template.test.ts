import type { Element } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { describe, expect, it } from 'vitest';
import { EACH, SLOT } from './ir.js';
import { buildTemplate, canonical, isLossless, singular } from './template.js';

const els = (html: string) =>
  fromHtml(html, { fragment: true }).children.filter((c): c is Element => c.type === 'element');

const CARDS = `<article class="card"><img src="/a.png" alt="A"><h3>Alpha</h3><p>First</p><ul><li>ts</li><li>react</li></ul><a href="/alpha">Read</a></article>
<article class="card"><img src="/b.png" alt="B"><h3>Beta</h3><p>Second</p><ul><li>go</li></ul><a href="/beta">Read</a></article>
<article class="card"><img src="/c.png" alt="C"><h3>Gamma</h3><p>Third</p><ul><li>rust</li><li>wasm</li><li>cli</li></ul><a href="/gamma">Read</a></article>`;

describe('buildTemplate', () => {
  it('turns differences into typed props, and varying runs into lists', () => {
    const cards = els(CARDS);
    const built = buildTemplate(cards)!;
    expect(built.props.map((p) => `${p.name}:${p.type.kind}`)).toEqual([
      'image:string',
      'imageAlt:string',
      'title:string',
      'description:string',
      'items:list',
      'href:string',
    ]);
    expect(built.values[2]).toEqual({
      image: '/c.png',
      imageAlt: 'C',
      title: 'Gamma',
      description: 'Third',
      items: ['rust', 'wasm', 'cli'],
      href: '/gamma',
    });
    const html = canonical(built.root);
    expect(html).toContain(`<${SLOT} data-path="title">`);
    expect(html).toContain(`<${EACH} data-item="item" data-path="items"><li><${SLOT} data-path="item">`);
    expect(html).toContain('<a href="href">Read</a>');
  });

  it('is lossless: every instance expands back to identical markup', () => {
    const cards = els(CARDS);
    expect(isLossless(buildTemplate(cards)!, cards)).toBe(true);
  });

  it('refuses structurally different instances', () => {
    expect(buildTemplate(els('<div class="a"><b>x</b></div><div class="b"><b>y</b></div>'))).toBeNull();
  });

  it('keeps identical parts constant', () => {
    const built = buildTemplate(els('<p class="x">Same <b>A</b></p><p class="x">Same <b>B</b></p>'))!;
    expect(built.props.map((p) => p.name)).toEqual(['description']);
    expect(canonical(built.root)).toContain('Same ');
  });
});

describe('singular', () => {
  it('handles common plurals', () => {
    expect([singular('tags'), singular('entries'), singular('boxes'), singular('data')]).toEqual([
      'tag',
      'entry',
      'box',
      'dataItem',
    ]);
  });
});
