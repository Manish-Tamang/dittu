import { describe, expect, it } from 'vitest';
import { cloneInput, scoreTable } from './tools.js';

describe('MCP tools', () => {
  it('summarizes reports for the model', () => {
    const t = scoreTable({
      results: [
        {
          target: 'preview',
          route: '/',
          width: 1440,
          diffImage: 'd.png',
          diff: {
            score: 0.9989,
            width: 1,
            heightA: 1,
            heightB: 1,
            diffPixels: 0,
            worstBands: [{ y: 400, height: 400, score: 0.9 }],
          },
        },
        {
          target: 'next',
          route: '/',
          width: 390,
          diffImage: 'e.png',
          diff: { score: 0.93, width: 1, heightA: 1, heightB: 1, diffPixels: 0, worstBands: [] },
        },
      ],
      errors: [],
    });
    expect(t.lowest).toBe(93);
    expect(t.passed).toBe(false);
    expect(t.scores[0]).toMatchObject({ score: 99.89, worstBandsY: [400] });
  });
  it('validates clone input', () => {
    expect(cloneInput.safeParse({ url: 'https://x.com', pages: 0 }).success).toBe(false);
    expect(cloneInput.safeParse({ url: 'x.com', frameworks: ['next'] }).success).toBe(true);
  });
});
