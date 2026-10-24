import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import { fullScreenshot, launch, load, newContext, stabilize, type Browser } from '../capture/browser.js';
import { DEFAULTS } from '../config/defaults.js';
import type { Manifest, Target, VerifyReport } from '../domain/report.js';
import { routeScope } from '../domain/site.js';
import { log } from '../util/log.js';
import { compareImages } from './diff.js';
import { startTarget, type RunningTarget } from './targets.js';

export interface VerifyOptions {
  outDir: string;
  manifest: Manifest;
  targets: Target[];
  widths: number[];
}

const heightFor = (width: number, desktopHeight: number) => (width < 700 ? DEFAULTS.mobile.height : desktopHeight);

async function shoot(browser: Browser, width: number, height: number, url: string, path: string) {
  const context = await newContext(browser, { width, height });
  const page = await context.newPage();
  try {
    await load(page, url, 500);
    await stabilize(page);
    await fullScreenshot(page, path);
  } finally {
    await context.close();
  }
}

/** Screenshot original and clone the same way and score every target × route × width. */
export async function verify(opts: VerifyOptions): Promise<VerifyReport> {
  const { outDir, manifest } = opts;
  const reportDir = join(outDir, 'report');
  const refDir = join(outDir, 'reference');
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(refDir, { recursive: true });
  const report: VerifyReport = { results: [], errors: [] };
  const browser = await launch();
  const desktopHeight = manifest.viewport.height;

  try {
    // Reference screenshots of the original (the capture viewport's one was taken during capture).
    for (const width of opts.widths) {
      for (const p of manifest.pages) {
        const ref = join(refDir, `${routeScope(p.route)}@${width}.png`);
        if (existsSync(ref)) continue;
        log.info(`original ${p.route} @${width}px`);
        await shoot(browser, width, heightFor(width, desktopHeight), p.url, ref);
      }
    }

    for (const target of opts.targets) {
      let server: RunningTarget;
      try {
        server = await startTarget(target, outDir);
      } catch (err) {
        report.errors.push(`${target}: ${(err as Error).message}`);
        log.error(`${target}: ${(err as Error).message}`);
        continue;
      }
      try {
        for (const width of opts.widths) {
          for (const p of manifest.pages) {
            const scope = routeScope(p.route);
            const shot = join(reportDir, `${target}-${scope}@${width}.png`);
            const diffImage = join(reportDir, `${target}-${scope}@${width}.diff.png`);
            await shoot(browser, width, heightFor(width, desktopHeight), server.url + p.route, shot);
            const diff = compareImages(join(refDir, `${scope}@${width}.png`), shot, diffImage);
            report.results.push({ target, route: p.route, width, diff, diffImage });
            const pct = (diff.score * 100).toFixed(2) + '%';
            const color = diff.score >= DEFAULTS.passScore ? pc.green : diff.score >= 0.85 ? pc.yellow : pc.red;
            log.info(`${target.padEnd(7)} ${p.route.padEnd(24)} @${String(width).padEnd(5)} ${color(pct)}`);
          }
        }
      } finally {
        server.stop();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}
