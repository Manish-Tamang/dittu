# Changelog

## 0.2.0 (2026-10-25)

- `--styling tailwind` (CLI, interactive prompt, MCP `styling`): Tailwind CSS v4 utilities wherever they render identically, the rest stays layered CSS. Each class is compiled and checked, and the cascade is simulated per element before and after. Sites built with Tailwind v4 keep their own classes. Next.js and Astro projects get the Tailwind setup. See docs/tailwind.md.
- Fix: Astro components didn't import icons referenced from data lists (`Icon7 is not defined` at build).
- Fix: Next.js type check failed on legacy HTML attributes React's types don't list (`<img border="0">`).

## 0.1.0 (2026-10-21)

First release.

- Published on npm as `@manishtamang/dittu` (the unscoped name was rejected). The command is still `dittu`: `npx @manishtamang/dittu clone <url>`.
- Interactive mode: `dittu`, `dittu <url>` and `dittu clone [url]` show a dotted DITTU banner and ask for frameworks, pages, verification, output folder and advanced settings (skipped for flags you pass, with `-y`, in CI, or without a terminal).
- Fix: flags after `clone` were captured by the root command (`-o` was ignored).
- Fix: re-cloning into an existing folder reused stale reference screenshots; previous results are now cleared (keeping `node_modules`).
- `dittu clone`: capture the live DOM + CSSOM in Chromium, download assets, export a static preview, a Next.js App Router project (JSX) and an Astro project, split into section components.
- Parser/hydration-safe markup repair (`<div>` in `<p>`, nested links, `<tr>` without `<tbody>`), canvas and WebGL snapshots.
- Motion recorder + runtime: class-toggle and inline-style reveals, Framer Motion / WAAPI animations, loops.
- Mobile render: layout that JS computes per viewport becomes `@media` overrides; time-varying elements excluded; desktop-only elements hidden below the breakpoint.
- `dittu verify`: pixel-diff scoring at desktop and mobile for the preview and the built apps (`--build`).
- `dittu mcp`: MCP server with `clone_website`, `verify_clone`, `read_report`.
- `dittu setup`: registers the MCP server and skills with Claude Code, Cursor, Gemini CLI and Codex.
- `dittu doctor`: environment checks with fixes.
