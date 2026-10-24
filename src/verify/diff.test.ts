import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareImages } from './diff.js';

const png = (w: number, h: number, rgb: [number, number, number]) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) p.data.set([...rgb, 255], i * 4);
  return PNG.sync.write(p);
};

describe('visual diff', () => {
  it('scores identical images 1 and counts missing height as different', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dittu-'));
    writeFileSync(join(dir, 'a.png'), png(10, 10, [200, 10, 10]));
    writeFileSync(join(dir, 'b.png'), png(10, 10, [200, 10, 10]));
    writeFileSync(join(dir, 'c.png'), png(10, 5, [200, 10, 10]));
    expect(compareImages(join(dir, 'a.png'), join(dir, 'b.png'), join(dir, 'd1.png')).score).toBe(1);
    expect(compareImages(join(dir, 'a.png'), join(dir, 'c.png'), join(dir, 'd2.png')).score).toBeCloseTo(0.5, 2);
  });
});
