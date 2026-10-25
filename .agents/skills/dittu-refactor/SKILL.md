---
name: dittu-refactor
description: Refactor a dittu-generated Next.js or Astro clone into maintainable code (reusable components with props, real interactivity, the user's own content) while keeping the pixel score from dropping. Use after `dittu clone` when the user wants to edit, clean up, componentize or build on the cloned site.
---

# Refactor a dittu clone without losing fidelity

Generated code is faithful but mechanical. Refactor in small steps and
**re-verify after each step**:

```bash
npx @manishtamang/dittu verify <out> --targets next    # or astro; or MCP verify_clone
```

The score must not drop. If it does, the last change altered rendering; fix it
before continuing.

## Where things are

- `next/app/<route>/page.jsx`, `next/components/<scope>/*.jsx` (`shared/` = used on several pages)
- `astro/src/pages`, `astro/src/components`
- `public/assets/css/<page>-<hash>.css`: the site's original CSS, in cascade
  order. Renaming a class in markup means renaming it here too.
- `data-dittu-m` marks elements animated by `public/assets/dittu-motion.js`
  (scroll reveals). Keep the attribute, or port that animation to Framer
  Motion / CSS and drop the attribute.
- `data-dittu-r` marks elements with mobile-specific overrides in the page CSS
  (`/* dittu: layout computed by JS at mobile width */`).

## Good refactors

1. **Extract repeated markup** (cards, list items, nav links, logos) into a
   component with props. Keep the exact element structure and class order.
2. **Restore behaviour** dittu froze: menu toggles, tabs, accordions,
   carousels. Add `"use client"` components in Next; islands in Astro.
3. **Swap content**: text, links, images. Keep image dimensions and aspect ratios.
4. **Rename sections** (`Section4` → `Testimonials`).

## Traps

- JSX text like `{" "}` and `{"\n  "}` is load-bearing: whitespace between
  inline elements changes layout. Don't "clean it up" across line breaks.
- Don't wrap sections in extra `<div>`s or change `<p>`/`<div>` choices, because
  selectors and margins depend on them.
- Don't move styles into Tailwind or CSS modules unless asked (for Tailwind,
  re-clone with `--styling tailwind` instead of converting by hand). If you do,
  verify after every component.
- Interactive state you add (open menu) shouldn't be the default render, or the
  score will drop for the wrong reason.
