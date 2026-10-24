import type { Command } from 'commander';
import { startStdioServer } from '../../server/server.js';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('run the MCP server over stdio (used by `dittu setup`)')
    .action(() => {
      startStdioServer();
    });
}
