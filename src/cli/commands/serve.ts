import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import { log } from '../../util/log.js';
import { serveStatic } from '../../verify/staticServer.js';

export function registerServe(program: Command) {
  program
    .command('serve')
    .description('serve the static preview of a clone')
    .argument('<dir>', 'output directory of a previous clone')
    .option('--port <n>', 'port', '4321')
    .action(async (dir: string, o) => {
      const outDir = resolve(dir);
      const { url } = await serveStatic(
        [
          ['/', join(outDir, 'preview')],
          ['/assets/', join(outDir, 'assets')],
        ],
        Number(o.port),
      );
      log.ok(`Preview at ${url}`);
    });
}
