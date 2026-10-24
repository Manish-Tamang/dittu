import { homedir } from 'node:os';
import { join } from 'node:path';
import { pkgRoot } from '../util/paths.js';
import { AGENTS, type Agent, type SetupContext } from './agents.js';

export interface SetupOptions {
  /** Agent ids to configure; default: every detected agent. */
  agents?: string[];
  dryRun?: boolean;
  home?: string;
}

export interface SetupResult {
  agent: Agent;
  actions: string[];
  error?: string;
}

/** The MCP command points at this checkout/installation, so it works before (and without) publishing. */
const mcpCommand = () => ({ command: process.execPath, args: [join(pkgRoot, 'scripts', 'dittu.mjs'), 'mcp'] });

export function setupAgents(opts: SetupOptions = {}): SetupResult[] {
  const ctx: SetupContext = {
    home: opts.home ?? homedir(),
    dryRun: Boolean(opts.dryRun),
    mcp: mcpCommand(),
    skillsDir: join(pkgRoot, '.agents', 'skills'),
  };
  const unknown = (opts.agents ?? []).filter((id) => !AGENTS.some((a) => a.id === id));
  if (unknown.length)
    throw new Error(`Unknown agent(s): ${unknown.join(', ')} (known: ${AGENTS.map((a) => a.id).join(', ')})`);
  const selected = opts.agents?.length
    ? AGENTS.filter((a) => opts.agents!.includes(a.id))
    : AGENTS.filter((a) => a.detect(ctx));
  return selected.map((agent) => {
    try {
      return { agent, actions: agent.install(ctx) };
    } catch (err) {
      return { agent, actions: [], error: (err as Error).message };
    }
  });
}
