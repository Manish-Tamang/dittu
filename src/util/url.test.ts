import { describe, expect, it } from 'vitest';
import { formatSrcset, normalizePageUrl, parseSrcset, resolveUrl } from './url.js';

describe('srcset', () => {
  it('parses descriptors and keeps commas inside URLs', () => {
    const list = parseSrcset('a.png 1x, /b.png?w=2,3 2x,data:image/png;base64,AAA= 3x');
    expect(list.map((c) => c.url)).toEqual(['a.png', '/b.png?w=2,3', 'data:image/png;base64,AAA=']);
    expect(formatSrcset(list)).toBe('a.png 1x, /b.png?w=2,3 2x, data:image/png;base64,AAA= 3x');
  });
});

describe('urls', () => {
  it('resolves relative URLs and rejects garbage', () => {
    expect(resolveUrl('../img/a.png', 'https://x.com/css/site.css')).toBe('https://x.com/img/a.png');
    expect(resolveUrl('http://[', 'https://x.com/')).toBeNull();
  });
  it('normalizes crawlable page URLs', () => {
    expect(normalizePageUrl('https://x.com/blog/?page=2#top')).toBe('https://x.com/blog');
    expect(normalizePageUrl('https://x.com/')).toBe('https://x.com/');
    expect(normalizePageUrl('mailto:a@b.c')).toBeNull();
  });
});
