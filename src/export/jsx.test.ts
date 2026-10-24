import type { Element } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { describe, expect, it } from 'vitest';
import type { ComponentDef } from '../reconstruct/ir.js';
import { MAP, SLOT, USE } from '../reconstruct/ir.js';
import { jsxAttributes, newJsxContext, toJsx } from './jsx.js';

const frag = (html: string) => fromHtml(html, { fragment: true });

const card: ComponentDef = {
  name: 'Card',
  kind: 'repeat',
  scope: 'shared',
  users: new Set(['/']),
  root: { type: 'element', tagName: 'div', properties: {}, children: [] },
  props: [
    { name: 'title', type: { kind: 'string' } },
    { name: 'style', type: { kind: 'style' } },
  ],
};

describe('toJsx', () => {
  it('keeps whitespace between inline elements and escapes braces in text', () => {
    const code = toJsx(frag('<p><a>One</a> <a>Two</a> Hard {cases} &amp; more</p>'), newJsxContext(new Map()));
    expect(code).toContain('{" "}');
    expect(code).toContain('{" Hard {cases} & more"}');
  });

  it('renders maps over typed data and records the constant', () => {
    const ctx = newJsxContext(new Map([['Card', card]]));
    const tree = frag(
      `<div class="grid"><${MAP} data-component="Card" data-var="cards" data-items='[{"title":"A"}]'></${MAP}></div>`,
    );
    expect(toJsx(tree, ctx)).toContain('{cards.map((card, i) => <Card key={i} {...card} />)}');
    expect(ctx.consts[0]).toMatchObject({ name: 'cards', component: 'Card' });
    expect(ctx.used.has('Card')).toBe(true);
  });

  it('turns slots and attribute markers into expressions', () => {
    const el: Element = {
      type: 'element',
      tagName: 'a',
      properties: { href: 'href' },
      children: [{ type: 'element', tagName: SLOT, properties: { dataPath: 'title' }, children: [] }],
    };
    expect(toJsx(el, newJsxContext(new Map()))).toBe('<a href={href}>{title}</a>');
  });

  it('passes props to components, converting style strings to objects', () => {
    const ctx = newJsxContext(new Map([['Card', card]]));
    const use = frag(
      `<${USE} data-component="Card" data-props='{"title":"Hi","style":"--d: 1s; color: red"}'></${USE}>`,
    );
    const code = toJsx(use, ctx);
    expect(code).toContain('title="Hi"');
    expect(code).toContain('style={css({');
    expect(ctx.needsCss).toBe(true);
  });

  it('spreads attributes React does not know, and makes form fields uncontrolled', () => {
    const code = toJsx(frag('<div jsaction="click:x"><input value="v" checked></div>'), newJsxContext(new Map()));
    expect(code).toContain('{...{\n  jsaction: "click:x"\n}}');
    expect(code).toContain('defaultValue="v"');
    expect(code).toContain('defaultChecked');
  });

  it('converts root attributes', () => {
    expect(
      jsxAttributes([
        ['lang', 'en'],
        ['class', 'dark font-sans'],
      ]),
    ).toBe(' lang="en" className="dark font-sans"');
  });
});
