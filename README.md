<div align="center">

# dittu: Clone Any Website

**Turn any website into an editable Next.js or Astro project, verified pixel by pixel.**

Layout, CSS, fonts, images and scroll animations. Not the backend.
One CLI, one MCP server, and skills for your coding agent.

[Quick start](#quick-start) · [How it works](#how-dittu-works) · [Benchmarks](#benchmarks) · [Docs](#documentation)

</div>

```
$ dittu clone https://dub.co/home --build

› Capturing https://dub.co/home
  1,680,755 chars of markup, 6 stylesheets, 33 animations, 13 JS-responsive elements
✓ Static preview → dittu-out/dub.co/preview
✓ Next.js project → dittu-out/dub.co/next
✓ Astro project → dittu-out/dub.co/astro

Visual match (1 − differing pixels / total)
  preview  /home    1440px   99.95%
  next     /home    1440px   99.95%
  astro    /home    1440px   99.95%
  preview  /home     390px   99.89%
  next     /home     390px   99.89%
  astro    /home     390px   99.89%
✓ All checks ≥ 95% (lowest 99.89%)
```

## Quick start

### Set up your agent

```bash
npx @manishtamang/dittu setup
```

Registers the dittu MCP server and installs the skills for every agent it
finds: **Claude Code, Cursor, Gemini CLI, Codex**. Check your machine first
with `npx @manishtamang/dittu doctor` (on Linux/WSL you may need
`sudo npx playwright install-deps chromium`).

### Ask your agent

> Clone https://example.com into Next.js and make the pricing cards a reusable component.

The agent calls `clone_website`, reads the scores, refactors the generated
components, and calls `verify_clone` to prove nothing visual changed.

### Use the terminal

```bash
npx @manishtamang/dittu                                        # interactive: banner, then pick URL, frameworks, pages…
npx @manishtamang/dittu clone https://example.com -y           # no questions: preview + Next.js + Astro, scored
npx @manishtamang/dittu clone https://example.com -p 5 --build # crawl 5 pages, build and score the apps
npx @manishtamang/dittu clone https://example.com -s tailwind # Tailwind classes where lossless, rest stays CSS
npx @manishtamang/dittu verify dittu-out/example.com --targets next
npx @manishtamang/dittu serve dittu-out/example.com
```

### Update dittu

```bash
npx @manishtamang/dittu@latest setup
```

## How dittu works

Most cloners screenshot a page and ask an LLM to redraw it. dittu copies what
the browser actually rendered, then checks the result:

1. **Capture**: Chromium loads the page, scrolls it so lazy content and scroll
   reveals fire, then freezes JS timers so carousels hold still. A second render
   at 390 px records layout that JS computes per viewport.
2. **Serialize the live DOM**, not the server HTML. Next.js/React sites come out
   as their final markup without hydration scripts or RSC payloads. Nesting the
   HTML parser would restructure gets repaired, so React hydrates cleanly.
3. **Keep the original CSS** in cascade order, including CSS-in-JS rules that
   exist only in the CSSOM. Media queries, hover states and keyframes keep working.
4. **Download every asset** from the same session and rewrite URLs.
5. **Export** to a static preview, a Next.js App Router project (JSX) and an
   Astro project, split into section components.
6. **Replay motion**: recorded scroll reveals, Framer Motion `animate` calls and
   loops run again through a 2 KB runtime.
7. **Verify**: screenshot original and clone the same way at desktop and mobile
   and score them. `--build` scores the built apps, not just the preview.

Details: [docs/architecture.md](docs/architecture.md).

## What you can clone

| Site type                                                       | Support                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Marketing sites, landing pages, portfolios, docs                | ✅ 99%+ typical                                                         |
| Next.js / React / Vue / Svelte / Astro builds                   | ✅ post-hydration DOM                                                   |
| Tailwind, CSS modules, styled-components, emotion               | ✅ original CSS kept                                                    |
| Scroll reveals (AOS, Framer Motion, GSAP, IntersectionObserver) | ✅ recorded and replayed                                                |
| Layout JS computes per viewport                                 | ✅ mobile render → media-query overrides                                |
| Multi-page sites                                                | ✅ `--pages N`, internal links rewired, shared header/footer components |
| Canvas / WebGL scenes                                           | ⚠️ still image                                                          |
| Carousels, tabs, menus, forms                                   | ⚠️ look is copied, behaviour is not                                     |
| Pages behind login or bot protection                            | ❌                                                                      |

## Benchmarks

| Site                       | Stack                    | Desktop      | Mobile     | Built apps            |
| -------------------------- | ------------------------ | ------------ | ---------- | --------------------- |
| dub.co/home                | Next.js, heavy animation | 99.95%       | 99.89%     | Next.js + Astro: same |
| nextjs.org                 | Next.js                  | 99.79%       | 99.99%     | 99.78–99.79%          |
| ui.shadcn.com              | Next.js + Tailwind       | 100.00%      | 100.00%    | 100.00%               |
| astro.build                | Astro                    | 100.00%      | 100.00%    |                       |
| manishtamang.com (3 pages) | Next.js                  | 99.89–99.99% | 99.80–100% | same                  |

Methodology and limits: [docs/fidelity.md](docs/fidelity.md).

## FAQ

**Does it copy the backend?** No. Data fetching, auth, APIs and form handling
are not copied. You get the frontend, ready to wire to your own logic.

**Why is the generated JSX full of `{" "}`?** Whitespace between inline elements
changes layout in HTML but is dropped by JSX. dittu keeps it explicit so the clone
renders identically. Refactor freely, and re-run `verify` to check.

**Can I get Tailwind classes instead of CSS?** Yes: `--styling tailwind`. Every
rule that can be expressed exactly becomes Tailwind utilities (sites built with
Tailwind v4 keep their own classes); the rest stays CSS, so scores don't drop.
See [Tailwind output](docs/tailwind.md).

**Is the 95% score honest?** It's raw pixel identity over the full page,
including height differences, at desktop and mobile. Diff images are saved next
to the scores so you can check.

**Can I clone any site I want?** Technically mostly yes. Legally, see the
[disclaimer](DISCLAIMER.md).

## Documentation

- [Installation](docs/installation.md)
- [CLI](docs/cli.md)
- [MCP server](docs/mcp.md)
- [Architecture](docs/architecture.md)
- [Fidelity and benchmarks](docs/fidelity.md)
- [Tailwind output](docs/tailwind.md)
- [Testing](docs/testing.md)
- [Roadmap](docs/roadmap.md)

## Disclaimer

dittu is for learning, prototyping, design references and migrating sites you
own. Cloning a site doesn't give you rights to its brand, copy, images or code.
Read [DISCLAIMER.md](DISCLAIMER.md).

## Related projects

[ditto.site](https://github.com/ion-design/ditto.site) by ion-design takes the
same capture-what-the-browser-rendered approach as a hosted API and MCP service.
dittu differs by running as a local CLI, keeping the site's original CSS by
default (Tailwind output is opt-in and only where it renders identically),
exporting Astro alongside Next.js, and scoring every clone with pixel-diff
verification.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Agents working in this repo: [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
