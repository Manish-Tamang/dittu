import type { Command } from 'commander';
import { runDoctor } from '../../pipeline/doctor.js';
import { printDoctor } from '../output.js';

export function registerDoctor(program: Command) {
  program
    .command('doctor')
    .description('check Node.js, Chromium and build tooling')
    .action(async () => {
      const checks = await runDoctor();
      printDoctor(checks);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
    });
}
