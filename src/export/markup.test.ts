import { fromHtml } from 'hast-util-from-html';
import { describe, expect, it } from 'vitest';
import { bodyToAstro } from './markup.js';

describe('Astro markup', () => {
  it('escapes braces in text but not in attributes (quoted attributes are literal in Astro)', () => {
    expect(bodyToAstro(fromHtml('<p data-x="{a}">Hi {name}</p>', { fragment: true }))).toBe(
      '<p data-x="{a}">Hi &#123;name&#125;</p>',
    );
  });
});
