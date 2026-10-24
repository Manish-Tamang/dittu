# Contributing

Thanks for helping make clones more faithful.

## Setup

```bash
pnpm install
node scripts/dittu.mjs doctor      # Chromium must launch for e2e tests
```

## Workflow

1. Branch from `main`.
2. Make the change, with tests:
   - pure logic → co-located `*.test.ts`
   - pipeline behaviour → extend `tests/fixtures/hard` and `tests/e2e`
3. `pnpm check` and `pnpm test:e2e`.
4. For capture/transform/export changes, clone a real site with `--build` and
   include the before/after scores in the PR.
5. Update `docs/` and `CHANGELOG.md`.

Commits are checked by a pre-commit hook (lint-staged: oxfmt + oxlint).

## Reporting a fidelity bug

Use the "Fidelity report" issue template: URL, scores, and the
`*.diff.png`. The most useful reports name the first element that differs.
