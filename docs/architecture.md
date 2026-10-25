# Architecture

dittu is a deterministic pipeline: **capture → transform → export → verify**.
No step rewrites the design with an LLM. The browser's rendered result is
serialized and converted mechanically, which is why clones land at 99%+
pixel identity. Agents (through the [MCP server](mcp.md) or
[skills](../.agents/skills)) act on top: they drive the pipeline, read scores,
and refactor the output while `verify` keeps the score from dropping.

```mermaid
flowchart LR
  subgraph entry[Entry points]
    CLI[cli/ — dittu clone · verify · serve · setup · doctor]
    MCP[server/ — MCP tools]
  end
  subgraph pipeline[pipeline/]
    RUN[run.ts — clone + verify]
    CLONE[clone.ts — orchestration]
  end
  subgraph capture[capture/ + bridge/browser]
    BROWSER[Chromium via Playwright]
    REC[recorder.js — motion]
    SNAP[snapshot.js — DOM + CSSOM]
    FP[fingerprint.js — mobile render]
    NET[network.ts — response bodies]
    CRAWL[crawl.ts — robots, BFS]
  end
  subgraph transform[transform/]
    HTML[html.ts — URLs, links, canvases]
    CSS[css.ts — cascade, @import, url()]
    ASSETS[assets.ts — local files]
    SPLIT[components.ts — sections]
  end
  subgraph export[export/]
    STATIC[preview/]
    NEXT[next/ — JSX]
    ASTRO[astro/]
  end
  subgraph verify[verify/]
    TARGETS[targets.ts — serve / build]
    DIFF[diff.ts — pixelmatch]
  end
  CLI --> RUN
  MCP --> RUN
  RUN --> CLONE
  CLONE --> capture
  capture --> transform
  transform --> export
  RUN --> verify
  verify --> TARGETS --> DIFF
```

## Source layout

| Path              | Responsibility                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `src/cli/`        | Commander program; one module per command in `commands/`; terminal output in `output.ts`       |
| `src/server/`     | MCP server (`@modelcontextprotocol/server`), tool schemas and handlers                         |
| `src/setup/`      | `dittu setup`: registers the MCP server and skills with Claude Code, Cursor, Gemini CLI, Codex |
| `src/pipeline/`   | Orchestration: `clone.ts`, `run.ts` (clone + verify), `manifest.ts`, `doctor.ts`               |
| `src/capture/`    | Browser session, scroll/settle/freeze, page capture, network recorder, crawler                 |
| `src/transform/`  | Turns a snapshot into a self-contained page: markup, CSS, assets, sections                     |
| `src/export/`     | Writers for the static preview, Next.js and Astro projects                                     |
| `src/verify/`     | Screenshot comparison, build/serve of targets, static server                                   |
| `src/domain/`     | Types and pure model helpers: snapshot, site model + routes, report/manifest                   |
| `src/config/`     | Defaults and pinned versions (Next, React, Astro)                                              |
| `src/util/`       | Small pure helpers (URLs, naming, hashing, logging, paths)                                     |
| `bridge/browser/` | Scripts evaluated **inside the page** (plain JS, no imports)                                   |
| `bridge/runtime/` | `motion.js`, shipped **into generated sites**                                                  |
| `.agents/skills/` | Agent skills (installed by `dittu setup`)                                                      |

Dependency direction: `cli`/`server` → `pipeline` → `capture`/`transform`/`export`/`verify` →
`domain`/`config`/`util`. `domain` imports nothing outside `domain` (and does no I/O).
`import/no-cycle` is enforced by oxlint.

## Capture

1. **Recorder** (`bridge/browser/recorder.js`) is injected before any site
   script. It observes `style`/`class` mutations from the document node and
   wraps `Element.prototype.animate`, so dittu knows which elements animate and
   from which state.
2. **Load → auto-scroll → settle**: wheel-scroll top to bottom and back so lazy
   images and IntersectionObserver reveals fire; wait for network idle, images and fonts.
3. **Mobile render** (same URL at 390 px): a DOM fingerprint
   (`fingerprint.js`: tag, inline style, class, content signature per DOM path).
4. **Freeze** (`freeze.js`): stub timers and `requestAnimationFrame`, and park videos on frame 0.
   Carousels and JS loops hold still, so the reference screenshot and the
   snapshot show the same moment.
5. **Snapshot** (`snapshot.js`):
   - serializes the live DOM into markup the HTML parser and React hydration
     reproduce exactly (repairs `<div>` in `<p>`, `<a>` in `<a>`, `<tr>`
     without `<tbody>`; drops scripts, handlers, invalid JSX attribute names)
   - dumps every stylesheet in cascade order, using the CSSOM when
     CSS-in-JS injected rules with `insertRule`
   - classifies recorded motion (class toggles, inline-style tweens, WAAPI, loops)
   - diffs against the mobile fingerprint: inline styles/classes JS set
     differently per viewport. It skips elements that change over time (n ≥ 2
     mutations), and when a desktop-only element's parent exists on mobile it
     gets hidden below the breakpoint.
   - replaces canvases with images (2D: `toDataURL`, WebGL: clipped screenshot)

## Transform

- `html.ts`: parse to hast; rewrite `src`, `srcset`, `poster`, `xlink:href`,
  inline `url()` to `/assets/...`; internal links to cloned routes.
- `css.ts`: tolerant parsing (`postcss-safe-parser`), `@import` inlining with
  `layer()`/`supports()`/media, `url()`/`image-set()` rewriting, per-sheet `media`.
- `assets.ts`: bodies from the network recorder first (same session), then
  fetches for referenced-but-unloaded files (all `srcset` sizes). Unused font subsets stay remote.
- `tailwind/` (`--styling tailwind`): class rules → Tailwind utilities where
  lossless. Each candidate is compiled by Tailwind and checked declaration by
  declaration; the cascade is simulated per element before and after; the rest
  goes into layers below Tailwind's utilities. See [tailwind.md](tailwind.md).
- `components.ts`: split the body into sections (`Header`, `Hero`,
  `PricingSection`, …). Identical sections across pages become `shared/` components.

## Export

All three exports render the **same markup and CSS**, so the static preview
score carries over to the built apps (confirmed by `--build`).

- **Next.js**: App Router, server components, JSX via `hast-util-to-estree`
  (React prop names, style objects, whitespace kept with `{" "}`), page CSS via
  `<link precedence>`, `turbopack.root` pinned.
- **Astro**: `compressHTML: false`; braces in text escaped (quoted attributes are literal in Astro).
- **Motion runtime** (`bridge/runtime/motion.js`): markup ships in its final
  state, the runtime rewinds recorded reveals and plays them on scroll, and
  toggles mobile-only classes.

## Verify

Original and clone go through the same procedure (load → scroll → settle →
freeze → full-page screenshot with `animations: 'disabled'`). Score =
1 − differing pixels / total (pixelmatch, threshold 0.1, union of both sizes,
so height differences count). See [fidelity.md](fidelity.md).
