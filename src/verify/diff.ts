import { readFileSync, writeFileSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { DiffResult } from '../domain/report.js';

const BAND = 400;

function pad(png: PNG, w: number, h: number, fill: [number, number, number]): Buffer {
  if (png.width === w && png.height === h) return png.data;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = fill[0];
    out[i * 4 + 1] = fill[1];
    out[i * 4 + 2] = fill[2];
    out[i * 4 + 3] = 255;
  }
  const cw = Math.min(png.width, w);
  for (let y = 0; y < Math.min(png.height, h); y++) {
    png.data.copy(out, y * w * 4, y * png.width * 4, y * png.width * 4 + cw * 4);
  }
  return out;
}

export function compareImages(aPath: string, bPath: string, diffPath: string): DiffResult {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  // Different fills so missing area always counts as a difference.
  const da = pad(a, w, h, [255, 0, 255]);
  const db = pad(b, w, h, [0, 255, 0]);
  const diff = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(da, db, diff.data, w, h, { threshold: 0.1, includeAA: false, alpha: 0.15 });
  writeFileSync(diffPath, PNG.sync.write(diff));

  const bands: { y: number; height: number; score: number }[] = [];
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const y1 = Math.min(h, y0 + BAND);
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) n++;
      }
    }
    bands.push({ y: y0, height: y1 - y0, score: 1 - n / ((y1 - y0) * w) });
  }
  return {
    score: 1 - diffPixels / (w * h),
    width: w,
    heightA: a.height,
    heightB: b.height,
    diffPixels,
    worstBands: bands
      .filter((band) => band.score < 0.98)
      .toSorted((x, y) => x.score - y.score)
      .slice(0, 5),
  };
}
