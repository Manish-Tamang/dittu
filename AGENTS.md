# AGENTS.md

Instructions for coding agents working **on dittu itself**. (To _use_ dittu,
see `.agents/skills/dittu`.)

## Commands

```bash
pnpm install
pnpm check          # typecheck + oxlint + oxfmt --check + knip + unit tests
pnpm test:e2e       # clones tests/fixtures/hard, requires ≥ 99%
node scripts/dittu.mjs doctor
node scripts/dittu.mjs clone <url> -o dittu-out/<name> [--build]
```

The fixture e2e test needs a launchable Chromium (`dittu doctor`).

## Layout

- `src/cli` → `src/pipeline` → `src/{capture,transform,export,verify}` → `src/{domain,config,util}`.
  Keep this direction; `import/no-cycle` is enforced.
- `src/domain` holds types and pure model helpers (no I/O, no imports outside `domain`).
- `bridge/browser/*.js` run **inside the page**: plain JS, no imports, each
  file a single function expression invoked through `bridgeCall()`.
  `recorder.js` and `freeze.js` are IIFEs.
- `bridge/runtime/motion.js` ships **into generated sites**: keep it small and dependency-free.
- Unit tests sit next to the code (`*.test.ts`); end-to-end tests live in `tests/e2e`.

## Rules

- Fidelity is the product. Any change to capture/transform/export must keep
  `pnpm test:e2e` green, and should be checked on a real Next.js site with
  `--build` against the table in `docs/fidelity.md`.
- Never rewrite captured CSS or markup in ways that change rendering
  (whitespace between inline elements, class order, wrapper elements).
- Generated Next.js and Astro projects must build with no manual edits.
- Versions pinned in generated projects live in `src/config/defaults.ts`.
- MCP mode: never write to stdout outside the protocol. Use `log` from `src/util/log.ts`.
- Update `docs/` and `CHANGELOG.md` when behaviour or options change.
