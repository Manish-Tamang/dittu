---
name: dittu
description: Clone a website's frontend (layout, CSS, fonts, images, scroll animations) into a Next.js or Astro project with dittu, and check it with pixel-diff scores. Use when the user wants to copy, clone, recreate or migrate the look of a website or page into React, Next.js or Astro.
---

# dittu: clone a site's frontend, verified

dittu renders the page in Chromium, serializes the live DOM and the original
CSS (including CSS-in-JS rules), downloads assets, records scroll animations,
and writes a static preview, a Next.js project and an Astro project. It then
screenshots original and clone at 1440 and 390 px and reports the percentage
of identical pixels.

## Run it

Prefer the MCP tools when the `dittu` server is connected:

- `clone_website { url, frameworks?, pages?, build?, remove? }`
- `verify_clone { outDir, targets? }`
- `read_report { outDir }`

Otherwise use the CLI:

```bash
npx dittu clone <url> [-o <out>] [-p <pages>] [--build] [--remove "<selector>" ...]
npx dittu verify <out> [--targets next,astro]
```

- `pages > 1` crawls same-site pages (robots.txt respected) and links them.
- `build: true` / `--build` also installs and builds the Next/Astro apps and
  scores them. Do this before handing the project over.
- `remove` drops cookie banners or chat widgets by CSS selector.
- If Chromium fails to start, run `npx dittu doctor` and relay its fix.

## Read the result

- `lowest ≥ 95` → good clone. Tell the user the scores and where the projects are
  (`outputs.next`, `outputs.astro`).
- Lower → open the `diffImage` (red = differing pixels) and the matching files in
  `reference/` (original) vs `report/` (clone). See the `dittu-fidelity-debugging`
  skill's table of causes, or try `--wait 4000`, `--remove`, or a mobile-first
  clone (`--viewport 390x844`).
- Always mention warnings (Shadow DOM, mobile DOM differences) and what isn't
  copied: click behaviour (menus, tabs, carousels, forms) is markup only.

## Afterwards

To turn the clone into maintainable code (components with props, real
interactivity, the user's own content), follow the `dittu-refactor` skill.

Only clone sites the user owns or has the right to copy, or keep the result
for learning and prototyping. Don't help publish someone else's brand, copy
or images.
