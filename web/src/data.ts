export const REPO = 'https://github.com/Manish-Tamang/dittu';
export const REPO_API = 'https://api.github.com/repos/Manish-Tamang/dittu';
export const NPM = 'https://www.npmjs.com/package/@manishtamang/dittu';
export const AUTHOR = {
  name: 'Manish Tamang',
  handle: '@golecodes',
  href: 'https://github.com/Manish-Tamang',
  site: 'https://manishtamang.com',
  x: '@Manishtamangxyz',
  sameAs: [
    'https://github.com/Manish-Tamang',
    'https://x.com/Manishtamangxyz',
    'https://www.linkedin.com/in/manish-tamang',
    'https://manishtamang.com',
  ],
};
export const SITE = {
  name: 'dittu',
  tagline: 'Clone any website into Next.js or Astro',
  description:
    'Turn any website into an editable Next.js or Astro project, verified pixel by pixel. One CLI, one MCP server, and skills for your coding agent.',
};

export const steps = [
  {
    title: 'Capture',
    body: 'Chromium loads the page and scrolls it so lazy content and scroll reveals fire, then freezes JS timers so carousels hold still. A second render at 390px records layout that JS computes per viewport.',
  },
  {
    title: 'Serialize the live DOM',
    body: 'Not the server HTML. Next.js and React sites come out as their final markup, without hydration scripts or RSC payloads. Nesting the HTML parser would restructure gets repaired, so React hydrates cleanly.',
  },
  {
    title: 'Keep the original CSS',
    body: 'In cascade order, including CSS-in-JS rules that only exist in the CSSOM. Media queries, hover states and keyframes keep working.',
  },
  {
    title: 'Download every asset',
    body: 'Fonts, images and media come from the same browser session, and every URL is rewritten to the local copy.',
  },
  {
    title: 'Export',
    body: 'A static preview, a Next.js App Router project (JSX) and an Astro project, split into section components.',
  },
  {
    title: 'Replay motion',
    body: 'Recorded scroll reveals, Framer Motion `animate` calls and loops run again through a 2 KB runtime.',
  },
  {
    title: 'Verify',
    body: 'Original and clone are screenshotted the same way at desktop and mobile, then scored. `--build` scores the built apps, not just the preview.',
  },
];

export type Support = 'yes' | 'partial' | 'no';

export const support: { site: string; level: Support; note: string }[] = [
  { site: 'Marketing sites, landing pages, portfolios, docs', level: 'yes', note: '99%+ typical' },
  { site: 'Next.js / React / Vue / Svelte / Astro builds', level: 'yes', note: 'Post-hydration DOM' },
  { site: 'Tailwind, CSS modules, styled-components, emotion', level: 'yes', note: 'Original CSS kept' },
  { site: 'Tailwind CSS output (--styling tailwind)', level: 'yes', note: 'Utilities where exact, the rest stays CSS' },
  {
    site: 'Scroll reveals (AOS, Framer Motion, GSAP, IntersectionObserver)',
    level: 'yes',
    note: 'Recorded and replayed',
  },
  { site: 'Layout JS computes per viewport', level: 'yes', note: 'Mobile render → media-query overrides' },
  { site: 'Multi-page sites', level: 'yes', note: '`--pages N`, links rewired, shared header/footer' },
  { site: 'Canvas / WebGL scenes', level: 'partial', note: 'Still image' },
  { site: 'Carousels, tabs, menus, forms', level: 'partial', note: 'Look is copied, behaviour is not' },
  { site: 'Pages behind login or bot protection', level: 'no', note: 'Not supported' },
];

export const benchmarks = [
  { site: 'dub.co/home', stack: 'Next.js, heavy animation', desktop: '99.95%', mobile: '99.89%', built: 'Same' },
  { site: 'nextjs.org', stack: 'Next.js', desktop: '99.79%', mobile: '99.99%', built: '99.78–99.79%' },
  { site: 'ui.shadcn.com', stack: 'Next.js + Tailwind', desktop: '100.00%', mobile: '100.00%', built: '100.00%' },
  { site: 'astro.build', stack: 'Astro', desktop: '100.00%', mobile: '100.00%', built: '—' },
  {
    site: 'manishtamang.com',
    stack: 'Next.js, 3 pages',
    desktop: '99.89–99.99%',
    mobile: '99.80–100%',
    built: 'Same',
  },
];

export const faq = [
  {
    q: 'Does it copy the backend?',
    a: 'No. Data fetching, auth, APIs and form handling are not copied. You get the frontend, ready to wire to your own logic.',
  },
  {
    q: 'Why is the generated JSX full of {" "}?',
    a: 'Whitespace between inline elements changes layout in HTML but is dropped by JSX. dittu keeps it explicit so the clone renders identically. Refactor freely, and re-run verify to check.',
  },
  {
    q: 'Can I get Tailwind classes instead of CSS?',
    a: 'Yes, with --styling tailwind. Every rule that can be expressed exactly becomes Tailwind utilities (sites built with Tailwind v4 keep their own classes) and the rest stays CSS, so the score does not drop.',
  },
  {
    q: 'Is the 95% score honest?',
    a: "It's raw pixel identity over the full page, including height differences, at desktop and mobile. Diff images are saved next to the scores so you can check.",
  },
  {
    q: 'Can I clone any site I want?',
    a: "Technically, mostly yes. Legally, no: cloning a site doesn't give you rights to its brand, copy, images or code. dittu is for learning, prototyping, design references and migrating sites you own.",
  },
];
