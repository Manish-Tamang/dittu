# Tailwind output

`--styling tailwind` writes styles as Tailwind CSS v4 utility classes wherever
that renders exactly like the original, and keeps the rest as CSS. The score is
the same as with the original stylesheet (99%+ on the fixture and real sites).

```bash
npx @manishtamang/dittu clone https://example.com --styling tailwind
```

The default is `--styling css`: the site's own stylesheet, untouched.

## What you get

```html
<!-- original CSS: .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px }
                   @media (max-width: 700px) { .cards { grid-template-columns: 1fr } } -->
<div class="grid grid-cols-[repeat(3,_1fr)] gap-[24px] [@media_(max-width:_700px)]:grid-cols-[1fr]"></div>
```

- **Idiomatic classes when they are exact**: `flex`, `items-center`, `w-full`,
  `p-4` for `1rem`, `rounded-lg` for `0.5rem`. Otherwise an arbitrary value
  (`p-[13px]`, `text-[#222]`) or an arbitrary property (`[box-shadow:…]`).
- **Sites built with Tailwind v4** keep their own classes. dittu reads the
  site's theme (`@layer theme`) and class-based `dark:` variant, and keeps every
  class whose rule Tailwind regenerates identically: `gap-3`, `md:px-4`,
  `dark:bg-zinc-800`, `hover:grayscale-0`.
- **The rest stays CSS** in `public/assets/css`: rules with combinators
  (`.nav a`), pseudo-elements, `@keyframes`, `@font-face`, rules on `html` or
  `body`, and anything the cascade check below rejects.
- Next.js gets `@tailwindcss/postcss`, Astro gets `@tailwindcss/vite`, and both
  get a `globals.css` / `global.css` entry, so you can keep editing classes.

## How it stays pixel-identical

1. **Only simple rules convert**: one or more classes on the element itself,
   optionally a tag, pseudo-classes like `:hover` or `:first-child`, inside
   `@media` or `@supports`. Classes the motion runtime toggles stay as they are.
2. **Every class is compiled by Tailwind and checked**: it must produce exactly
   the original property, value, media query and selector state. A class that
   doesn't is never used.
3. **The cascade is simulated per element**, before and after: importance,
   layers, specificity and source order on one side, Tailwind's class order
   (the order `prettier-plugin-tailwindcss` uses) on the other. A rule converts
   only if every element ends up with the same winning value; otherwise the rule
   stays CSS. The check repeats until nothing changes.
4. **The leftover CSS keeps its cascade**: it goes into cascade layers below
   Tailwind's utilities (`@layer properties, theme, dittu-…, dittu-unlayered,
   base, components, utilities`). Unlayered CSS behaves exactly like a final
   layer, so the site's own order is unchanged.
5. **Nothing from Tailwind can restyle the page by accident**: no preflight
   (the site's base styles stay in charge); theme values are inlined for sites
   not built with Tailwind; leftover class names that Tailwind would also
   generate (`container`, `hidden`, `md:flex`) get a `site-` prefix.

The static preview links the CSS a project build produces for the same classes,
so `dittu verify` scores the converted result; `--build` scores the built apps.

## Limits

- Non-Tailwind sites mostly get arbitrary values (`p-[16px]`): pixel values
  don't map exactly onto the rem spacing scale.
- Inline `style` attributes stay inline styles.
- A few Tailwind classes regenerate differently than the Tailwind version a
  site was built with (`space-y-*`, gradient stops): those keep their original
  CSS under a `site-` name.
