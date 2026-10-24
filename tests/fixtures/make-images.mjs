// Generates the fixture's raster images (gradient PNGs at several sizes).
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const dir = new URL('./hard/img/', import.meta.url);
function grad(w, h, a, b, name) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = (x + y) / (w + h), i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(a[c] * (1 - t) + b[c] * t);
    png.data[i + 3] = 255;
  }
  writeFileSync(new URL(name, dir), PNG.sync.write(png));
}
grad(400, 250, [255, 94, 58], [255, 42, 104], 'card-400.png');
grad(800, 500, [255, 94, 58], [255, 42, 104], 'card-800.png');
grad(64, 64, [30, 30, 60], [90, 90, 160], 'tile.png');
grad(1200, 600, [20, 30, 80], [120, 40, 160], 'hero-bg.png');
