# Installation

Requirements: Node.js 20.11+ (24 recommended, see `.nvmrc`) and npm.

## Set up your agent

```bash
npx @manishtamang/dittu setup
```

Registers the `dittu` MCP server and installs the skills for every agent it
finds (Claude Code, Cursor, Gemini CLI, Codex). Preview with `--dry-run`.

## Browser

dittu drives Chromium through Playwright:

```bash
npx playwright install chromium
```

On Linux and WSL, Chromium also needs system libraries:

```bash
sudo npx playwright install-deps chromium
```

Check everything with:

```bash
npx @manishtamang/dittu doctor
```

```
✓ Node.js                v24.21.0
✓ Chromium (Playwright)  ~/.cache/ms-playwright/chromium-1248/…
✗ Chromium launches      missing system libraries: libnspr4.so
  fix: sudo npx playwright install-deps chromium
✓ npm (for --build)      v11.19.0
```

## From source

```bash
git clone https://github.com/Manish-Tamang/dittu && cd dittu
pnpm install
node scripts/dittu.mjs doctor
node scripts/dittu.mjs setup       # points agents at this checkout
```

`scripts/dittu.mjs` runs `dist/` when built (`pnpm build`), otherwise the
TypeScript sources through tsx.
