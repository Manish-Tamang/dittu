---
name: dittu-fidelity-debugging
description: Diagnose and fix low dittu clone scores (below 95%) by locating the first differing element and tracing it to capture, transform or export. Use when a dittu clone looks wrong, a score is low, or when improving dittu's pipeline itself.
---

# Debugging a low score

## 1. Locate

- `report/report.json` → `worstBands` (y offsets of the least similar 400 px bands).
- Find the **first** band where reference and clone diverge. Everything after a
  height change shifts, so later bands are usually just consequences.
- Crop the same region of `reference/<page>@<w>.png` and
  `report/<target>-<page>@<w>.png` and compare them side by side.
- Compare image heights: a taller or shorter clone means some element has a
  different height.

## 2. Classify

| What you see                                         | Cause                                  | Where                                                                |
| ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Different frame of a carousel, demo or logo rotation | JS timer state (inherent)              | expected; frozen per capture                                         |
| Element at desktop position on mobile                | inline layout JS computes per viewport | mobile render diff in `bridge/browser/snapshot.js` (`responsiveFor`) |
| Extra or missing items on mobile                     | DOM differs per viewport               | desktop-only hiding in `responsiveFor`; mobile-only DOM unsupported  |
| Overlapping elements                                 | animation classes captured mid-cycle   | `volatile` set (elements mutated ≥ 2×)                               |
| Missing reveal animation                             | recorder missed it                     | `bridge/browser/recorder.js`, `analyzeMotion`                        |
| Image/canvas off by a pixel                          | replaced element size                  | canvas → img handling in `snapshot.js` / `capture.ts`                |
| Wrong font everywhere                                | font not downloaded                    | `failedAssets` in `dittu.json`; `transform/assets.ts`                |
| Layout differs only in Next/Astro                    | export changed markup                  | compare `preview/` HTML with the built HTML                          |

## 3. Fix and prove

1. Reproduce with the smallest case: add it to `tests/fixtures/hard` if it
   fits there.
2. Fix the pipeline, not the output.
3. `pnpm check && pnpm test:e2e`
4. Re-clone the real site; scores on the other benchmark sites
   (`docs/fidelity.md`) must not drop.
