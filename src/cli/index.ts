import { Command } from 'commander';
import { log } from '../util/log.js';
import { VERSION } from '../version.js';
import { registerClone } from './commands/clone.js';
import { registerDoctor } from './commands/doctor.js';
import { registerMcp } from './commands/mcp.js';
import { registerServe } from './commands/serve.js';
import { registerSetup } from './commands/setup.js';
import { registerVerify } from './commands/verify.js';

function buildProgram(): Command {
  const program = new Command()
    .name('dittu')
    .description('Clone any website frontend into Next.js / Astro, verified by visual diff.')
    .version(VERSION)
    // Root and `clone` share flag names; bind each flag to the command it follows.
    .enablePositionalOptions();
  registerClone(program);
  registerVerify(program);
  registerServe(program);
  registerSetup(program);
  registerMcp(program);
  registerDoctor(program);
  return program;
}

export async function main(argv = process.argv) {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
