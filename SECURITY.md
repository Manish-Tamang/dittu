# Security

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories
("Report a vulnerability" on the repository), not in public issues.

## Model

- dittu loads arbitrary web pages in headless Chromium. Page scripts run in the
  browser sandbox; dittu reads results through Playwright and never executes
  page-provided code in Node.
- Downloaded assets are written under the chosen output directory only.
  File names are derived from hashed URLs, never from raw paths.
- `--build` runs `npm install` and the framework build inside the generated
  project. Those are dittu's own templates with pinned versions; no
  dependencies are taken from the cloned site.
- `dittu setup` edits agent configuration files (`~/.cursor/mcp.json`,
  `~/.gemini/settings.json`, `~/.codex/config.toml`) and runs `claude mcp add`.
  It only adds or replaces the `dittu` entry. `--dry-run` shows the changes.
- The MCP server runs locally over stdio and exposes no network listener.
