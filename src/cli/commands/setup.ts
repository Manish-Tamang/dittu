import type { Command } from 'commander';
import { setupAgents } from '../../setup/setup.js';
import { list } from '../options.js';
import { printSetup } from '../output.js';

export function registerSetup(program: Command) {
  program
    .command('setup')
    .description('register the dittu MCP server and skills with your coding agents')
    .option('--agents <list>', 'claude-code, cursor, gemini, codex (default: all detected)')
    .option('--dry-run', 'show what would change without writing anything')
    .action((o) => {
      const results = setupAgents({ agents: o.agents ? list(o.agents) : undefined, dryRun: Boolean(o.dryRun) });
      printSetup(results, Boolean(o.dryRun));
      if (results.some((r) => r.error)) process.exitCode = 1;
    });
}
