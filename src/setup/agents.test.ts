import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupAgents } from './setup.js';

const home = () => mkdtempSync(join(tmpdir(), 'dittu-home-'));

describe('setup', () => {
  it('merges into existing JSON configs without dropping other servers', () => {
    const h = home();
    mkdirSync(join(h, '.cursor'));
    writeFileSync(join(h, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    const [r] = setupAgents({ home: h, agents: ['cursor'] });
    expect(r.error).toBeUndefined();
    const cfg = JSON.parse(readFileSync(join(h, '.cursor', 'mcp.json'), 'utf8'));
    expect(Object.keys(cfg.mcpServers)).toEqual(['other', 'dittu']);
    expect(cfg.mcpServers.dittu.args.at(-1)).toBe('mcp');
  });

  it('is idempotent for Codex TOML', () => {
    const h = home();
    mkdirSync(join(h, '.codex'));
    writeFileSync(join(h, '.codex', 'config.toml'), 'model = "x"\n\n[mcp_servers.other]\ncommand = "y"\n');
    setupAgents({ home: h, agents: ['codex'] });
    setupAgents({ home: h, agents: ['codex'] });
    const toml = readFileSync(join(h, '.codex', 'config.toml'), 'utf8');
    expect(toml.match(/\[mcp_servers\.dittu\]/g)).toHaveLength(1);
    expect(toml).toContain('[mcp_servers.other]');
  });

  it('writes nothing on dry run and rejects unknown agents', () => {
    const h = home();
    const [r] = setupAgents({ home: h, agents: ['gemini'], dryRun: true });
    expect(r.actions[0]).toContain('settings.json');
    expect(() => readFileSync(join(h, '.gemini', 'settings.json'))).toThrow(/ENOENT/);
    expect(() => setupAgents({ home: h, agents: ['vim'] })).toThrow(/Unknown agent/);
  });
});
