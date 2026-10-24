import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

interface McpCommand {
  command: string;
  args: string[];
}

export interface SetupContext {
  home: string;
  dryRun: boolean;
  mcp: McpCommand;
  /** Directory containing one folder per skill (each with SKILL.md). */
  skillsDir: string;
}

export interface Agent {
  id: string;
  name: string;
  detect(ctx: SetupContext): boolean;
  /** Returns human-readable descriptions of what was (or would be) changed. */
  install(ctx: SetupContext): string[];
}

const SERVER_NAME = 'dittu';

function onPath(bin: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => dir && existsSync(join(dir, bin)));
}

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(`${file} is not valid JSON; fix or remove it and re-run setup`);
  }
}

/** Add/replace `mcpServers.dittu` in a JSON config (Cursor, Gemini CLI, Claude Desktop format). */
function mergeMcpJson(file: string, ctx: SetupContext): string {
  const config = readJson(file);
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  servers[SERVER_NAME] = { command: ctx.mcp.command, args: ctx.mcp.args };
  config.mcpServers = servers;
  if (!ctx.dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  }
  return `MCP server "${SERVER_NAME}" → ${file}`;
}

function copySkills(dest: string, ctx: SetupContext): string[] {
  const out: string[] = [];
  for (const name of readdirSync(ctx.skillsDir)) {
    if (!existsSync(join(ctx.skillsDir, name, 'SKILL.md'))) continue;
    if (!ctx.dryRun) cpSync(join(ctx.skillsDir, name), join(dest, name), { recursive: true });
    out.push(`skill "${name}" → ${join(dest, name)}`);
  }
  return out;
}

const toml = (s: string) => JSON.stringify(s);

export const AGENTS: Agent[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    detect: (ctx) => onPath('claude') || existsSync(join(ctx.home, '.claude')),
    install(ctx) {
      const done = copySkills(join(ctx.home, '.claude', 'skills'), ctx);
      const args = ['mcp', 'add', '--scope', 'user', SERVER_NAME, '--', ctx.mcp.command, ...ctx.mcp.args];
      if (!onPath('claude')) {
        done.push(`MCP: "claude" CLI not found — run later: claude ${args.join(' ')}`);
        return done;
      }
      if (!ctx.dryRun) {
        try {
          execFileSync('claude', ['mcp', 'remove', '--scope', 'user', SERVER_NAME], { stdio: 'ignore' });
        } catch {}
        execFileSync('claude', args, { stdio: 'ignore' });
      }
      done.push(`MCP server "${SERVER_NAME}" → claude mcp add --scope user`);
      return done;
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: (ctx) => existsSync(join(ctx.home, '.cursor')),
    install: (ctx) => [mergeMcpJson(join(ctx.home, '.cursor', 'mcp.json'), ctx)],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    detect: (ctx) => onPath('gemini') || existsSync(join(ctx.home, '.gemini')),
    install: (ctx) => [mergeMcpJson(join(ctx.home, '.gemini', 'settings.json'), ctx)],
  },
  {
    id: 'codex',
    name: 'Codex',
    detect: (ctx) => onPath('codex') || existsSync(join(ctx.home, '.codex')),
    install(ctx) {
      const file = join(ctx.home, '.codex', 'config.toml');
      const block = `[mcp_servers.${SERVER_NAME}]\ncommand = ${toml(ctx.mcp.command)}\nargs = [${ctx.mcp.args.map(toml).join(', ')}]\n`;
      const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
      // Replace an existing [mcp_servers.dittu] table (up to the next table header) or append.
      const re = new RegExp(`\\[mcp_servers\\.${SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`);
      const next = re.test(current)
        ? current.replace(re, block.trimEnd())
        : `${current}${current && !current.endsWith('\n') ? '\n' : ''}\n${block}`;
      if (!ctx.dryRun) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, next);
      }
      return [`MCP server "${SERVER_NAME}" → ${file}`];
    },
  },
];
