# Fidelity

## The score

For each target (preview, built Next.js, built Astro), route and width,
original and clone are screenshotted with the same procedure and compared with
[pixelmatch](https://github.com/mapbox/pixelmatch) (threshold 0.1,
anti-aliasing ignored):

```
score = 1 − differing pixels / (max width × max height)
```

Images are compared over the union of both sizes, and missing area counts as
different, so a clone that is 180 px too tall is penalized for it. Each result
also lists the worst 400 px bands, and a `*.diff.png` marks differing pixels in red.

Target: **≥ 95%** at desktop (1440) and mobile (390).

Pixel scores reward large identical areas. Look at the diff images too:
a 99% score can still hide a wrong logo.

## Benchmarks

Measured 2026-10-21 with dittu 0.1.0, default options. "Built" rows are the
generated apps after `npm install && build`, served and screenshotted.

| Site                         | Stack                         | Desktop      | Mobile       | Built Next.js / Astro |
| ---------------------------- | ----------------------------- | ------------ | ------------ | --------------------- |
| hard-cases fixture (2 pages) | hand-written, every edge case | 99.99%       | 99.91–99.98% | same as preview       |
| manishtamang.com (3 pages)   | Next.js                       | 99.89–99.99% | 99.80–100%   | same as preview       |
| dub.co/home                  | Next.js, heavy animation      | 99.95%       | 99.89%       | same as preview       |
| nextjs.org                   | Next.js                       | 99.79%       | 99.99%       | 99.78–99.79% / 99.99% |
| ui.shadcn.com                | Next.js + Tailwind            | 100.00%      | 100.00%      | 100.00%               |
| astro.build                  | Astro                         | 100.00%      | 100.00%      |                       |

Reproduce with `pnpm benchmark` (writes `dittu-out/bench/`).

## What is copied

|                                                                               |                                       |
| ----------------------------------------------------------------------------- | ------------------------------------- |
| Layout, typography, colors                                                    | ✅ original CSS in cascade order      |
| CSS-in-JS (styled-components, emotion)                                        | ✅ CSSOM rules                        |
| Responsive CSS (media queries)                                                | ✅                                    |
| Layout JS computes per viewport                                               | ✅ mobile render → `@media` overrides |
| Hover / focus (CSS)                                                           | ✅                                    |
| `@keyframes`, transitions                                                     | ✅                                    |
| Scroll reveals (AOS, Framer Motion `whileInView`, GSAP, IntersectionObserver) | ✅ recorded and replayed              |
| WAAPI loops                                                                   | ✅ replayed                           |
| Fonts, images, all `srcset` sizes, videos                                     | ✅ local files                        |
| Canvas / WebGL                                                                | ⚠️ still image of the captured frame  |
| JS-timed carousels, logo flippers, demos                                      | ⚠️ frozen on one frame                |
| Click behaviour (menus, tabs, accordions, forms)                              | ❌ markup only                        |
| Shadow DOM internals                                                          | ❌ light DOM only (warned)            |
| Mobile-only DOM (rendered only below a breakpoint by JS)                      | ❌ desktop markup kept (warned)       |
| Login walls, bot challenges                                                   | ❌ not bypassed                       |

## Troubleshooting a low score

| Symptom                        | Likely cause                            | Try                                           |
| ------------------------------ | --------------------------------------- | --------------------------------------------- |
| Everything below some y is off | one element has a different height      | crop the first red band in reference vs clone |
| Desktop fine, mobile low       | DOM differs per viewport (see warnings) | `--viewport 390x844` for a mobile-first clone |
| Bottom of page missing         | lazy content never loaded               | `--wait 4000`                                 |
| Overlay in clone               | cookie banner / chat widget             | `--remove "#cookie-banner"`                   |
| Text metrics off everywhere    | font failed to download                 | `failedAssets` in `dittu.json`                |
| Small diffs in one widget      | JS-timed animation at a different frame | expected; check the diff image                |
