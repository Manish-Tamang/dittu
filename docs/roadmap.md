# Roadmap

## Done (0.1)

- Deterministic capture of the live DOM + CSSOM, network-recorded assets
- Parser/hydration-safe markup repair, canvas snapshots
- Static preview, Next.js (App Router, JSX) and Astro exports with section components
- Motion recorder + runtime (class toggles, inline-style tweens, WAAPI, loops)
- Mobile render: JS-computed per-viewport layout → `@media` overrides; time-varying elements excluded
- Visual verification of preview and built apps
- Tailwind CSS v4 output (`--styling tailwind`): utilities wherever they render identically, verified by compiling each class and simulating the cascade; sites built with Tailwind v4 keep their own classes
- CLI, MCP server, `setup` for Claude Code / Cursor / Gemini CLI / Codex, `doctor`

## Next

- **Tablet render** (third width) for layout JS computes between breakpoints.
- **Mobile-only DOM**: serialize subtrees that exist only on the mobile render and show them with `@media`.
- **Continuous JS animation → CSS**: sample transforms of rAF-driven loops (marquees) and emit `@keyframes`.
- **JS hover states**: synthesize hovers to record Framer `whileHover`-style changes.
- **Shadow DOM**: declarative shadow roots for web components.
- **Refactor passes guarded by verify**: CSS modules, prop extraction for repeated sections.
- **More Tailwind coverage**: pseudo-elements (`before:`), descendant selectors as `group-*`/`peer-*` variants, inline styles.
- **TypeScript output** for the Next.js export.
- **Publishing**: npm package, MCP registry (`server.json`), release automation.
