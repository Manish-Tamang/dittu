#!/usr/bin/env node
// Clone a set of real sites and print a markdown score table.
//   pnpm benchmark                      # default sites
//   pnpm benchmark https://a.com b.com  # custom
import { join, resolve } from 'node:path';

const { register } = await import('tsx/esm/api');
register();
const { cloneAndVerify } = await import(new URL('../src/pipeline/run.ts', import.meta.url).href);
const { DEFAULTS } = await import(new URL('../src/config/defaults.ts', import.meta.url).href);

const DEFAULT_SITES = ['https://nextjs.org', 'https://ui.shadcn.com', 'https://astro.build'];
const sites = process.argv.slice(2).map((u) => (/^https?:\/\//.test(u) ? u : `https://${u}`));
const rows = [];
const pct = (r) => (r ? (r.diff.score * 100).toFixed(2) + '%' : 'n/a');

for (const url of sites.length ? sites : DEFAULT_SITES) {
  const outDir = resolve(join('dittu-out', 'bench', new URL(url).hostname));
  try {
    const { report } = await cloneAndVerify({
      url,
      outDir,
      frameworks: [],
      pages: 1,
      viewport: DEFAULTS.viewport,
      mobile: DEFAULTS.mobile,
      breakpoint: DEFAULTS.breakpoint,
      remove: [],
      waitMs: DEFAULTS.waitMs,
      split: true,
      format: false,
      verify: true,
      build: false,
      widths: [...DEFAULTS.verifyWidths],
    });
    const at = (w) => report.results.find((r) => r.width === w);
    rows.push(`| ${url} | ${pct(at(1440))} | ${pct(at(390))} |`);
  } catch (err) {
    rows.push(`| ${url} | error: ${err.message.split('\n')[0]} | |`);
  }
}

console.log('\n| Site | Desktop 1440 | Mobile 390 |\n|---|---|---|\n' + rows.join('\n'));
