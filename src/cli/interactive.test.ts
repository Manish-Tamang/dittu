import { stripVTControlCharacters as strip } from 'node:util';
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults.js';
import { banner } from './banner.js';
import { summary, type CloneAnswers } from './interactive.js';

const base: CloneAnswers = {
  url: 'https://example.com/',
  frameworks: ['next', 'astro'],
  styling: 'css',
  pages: 1,
  verify: true,
  build: false,
  mobile: true,
  breakpoint: DEFAULTS.breakpoint,
  remove: [],
  waitMs: DEFAULTS.waitMs,
};

describe('banner', () => {
  it('draws DITTU as a 7-row dot matrix', () => {
    const rows = banner(false)
      .split('\n')
      .filter((l) => l.includes('●'));
    expect(rows).toHaveLength(7);
    expect(rows[0].trim()).toBe('● ● ● ● ·   ● ● ● ● ●   ● ● ● ● ●   ● ● ● ● ●   ● · · · ●');
  });
});

describe('summary', () => {
  it('lists only what matters', () => {
    const s = strip(summary(base));
    expect(s).toContain('Next.js + Astro + preview');
    expect(s).toContain('this page');
    expect(s).toContain('original CSS');
    expect(s).toContain('dittu-out/example.com');
    expect(s).not.toContain('Breakpoint');
  });
  it('shows non-default advanced settings', () => {
    const s = strip(summary({ ...base, frameworks: [], pages: 5, build: true, mobile: false, remove: ['#cookie'] }));
    expect(s).toContain('static preview only');
    expect(s).toContain('up to 5');
    expect(s).toContain('preview + built apps');
    expect(s).toContain('Mobile render');
    expect(s).toContain('#cookie');
  });
});
