import { resolve } from 'node:path';
import type { Command } from 'commander';
import { DEFAULTS } from '../../config/defaults.js';
import type { Target } from '../../domain/report.js';
import { readManifest } from '../../pipeline/manifest.js';
import { verify } from '../../verify/verify.js';
import { list } from '../options.js';
import { printReport } from '../output.js';

export function registerVerify(program: Command) {
  program
    .command('verify')
    .description('re-score an existing clone against the original')
    .argument('<dir>', 'output directory of a previous clone')
    .option('--build', 'also install, build and verify the generated Next/Astro apps')
    .option('--targets <list>', 'preview, next, astro (overrides --build)')
    .option('--widths <list>', 'viewport widths to verify', DEFAULTS.verifyWidths.join(','))
    .action(async (dir: string, o) => {
      const outDir = resolve(dir);
      const manifest = readManifest(outDir);
      const targets: Target[] = o.targets
        ? (list(o.targets) as Target[])
        : ['preview', ...(o.build ? manifest.frameworks : [])];
      printReport(await verify({ outDir, manifest, targets, widths: list(o.widths).map(Number) }));
    });
}
