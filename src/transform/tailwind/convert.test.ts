import type { Element, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { visit } from 'unist-util-visit';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { VERSIONS } from '../../config/defaults.js';
import { TailwindCompiler, sameValue } from './compiler.js';
import { convertPage } from './convert.js';
import { detectTheme } from './index.js';

let compiler: TailwindCompiler;
beforeAll(async () => {
  compiler = await TailwindCompiler.create();
});

function run(html: string, css: string, toggled: string[] = []) {
  const body = fromHtml(html, { fragment: true }) as Root;
  const result = convertPage(
    { body, css, htmlAttrs: [], bodyAttrs: [], toggled: new Set(toggled) },
    compiler,
    new Set(),
  );
  const classes = (sel: string) => {
    let found: Element | undefined;
    visit(body, 'element', (el: Element) => {
      if (`#${el.properties.id}` === sel) found = el;
    });
    return (found?.properties.className as string[] | undefined) ?? [];
  };
  return { result, classes, css: result.css.toString() };
}

describe('convertPage', () => {
  it('turns simple class rules into utilities and drops the rule', () => {
    const { classes, css, result } = run(
      '<a id="b" class="btn">Go</a>',
      '.btn { display: inline-block; padding: 12px 20px; color: #222; border-radius: 0.5rem }',
    );
    expect(classes('#b')).toEqual(expect.arrayContaining(['inline-block', 'rounded-lg', 'text-[#222]']));
    expect(classes('#b')).not.toContain('btn');
    expect(css).not.toContain('.btn');
    expect(result.stats.converted).toBe(1);
  });

  it('maps rem values onto the spacing scale', () => {
    const { classes } = run('<div id="d" class="box"></div>', '.box { padding: 1rem; margin-top: 0.5rem }');
    expect(classes('#d')).toEqual(expect.arrayContaining(['p-4', 'mt-2']));
  });

  it('keeps a rule as CSS when a more specific rule overrides it', () => {
    const { classes, css } = run(
      '<nav class="nav"><a id="l" class="link">x</a></nav>',
      '.nav a { color: blue } .link { color: red; font-weight: 700 }',
    );
    expect(css).toContain('.link');
    expect(classes('#l')).toContain('link');
  });

  it('converts past a low-specificity reset', () => {
    const { classes, css } = run('<div id="c" class="card"></div>', '* { margin: 0 } .card { margin: 8px }');
    expect(classes('#c')).toContain('m-[8px]');
    expect(css).not.toContain('.card');
  });

  it('turns media queries and hover into variants', () => {
    const { classes } = run(
      '<div id="g" class="cards"></div>',
      '.cards { grid-template-columns: repeat(3, 1fr) } .cards:hover { opacity: 0.5 } @media (max-width: 700px) { .cards { grid-template-columns: 1fr } }',
    );
    const list = classes('#g');
    expect(list).toContain('grid-cols-[repeat(3,_1fr)]');
    expect(list).toContain('hover:opacity-[0.5]');
    expect(list.some((c) => c.startsWith('[@media_(max-width:_700px)]:'))).toBe(true);
  });

  it('keeps min-width variants when the cascade order matches Tailwind', () => {
    const { classes } = run(
      '<div id="r" class="row"></div>',
      '.row { display: block } @media (min-width: 768px) { .row { display: flex } }',
    );
    expect(classes('#r')).toEqual(expect.arrayContaining(['block', 'min-[768px]:flex']));
  });

  it('keeps rules as CSS when Tailwind would order them differently', () => {
    const { css } = run(
      '<div id="x" class="a b"></div>',
      '@media (min-width: 768px) { .a { color: red } } .b { color: blue }',
    );
    expect(css).toContain('.a');
    expect(css).toContain('.b');
  });

  it('never converts classes the motion runtime toggles', () => {
    const { css, classes } = run(
      '<div id="m" class="reveal in"></div>',
      '.reveal { transition: opacity .6s } .reveal.in { opacity: 1 }',
      ['in'],
    );
    expect(css).toContain('.reveal.in');
    expect(classes('#m')).toEqual(expect.arrayContaining(['reveal', 'in']));
  });

  it('renames kept classes that Tailwind would also generate', () => {
    const { classes, css, result } = run(
      '<div class="nav"><span id="h" class="hidden">x</span></div>',
      '.nav .hidden { display: none }',
    );
    expect(result.renames.get('hidden')).toBe('site-hidden');
    expect(classes('#h')).toEqual(['site-hidden']);
    expect(css).toContain('.site-hidden');
  });

  it('survives selectors the parser rejects', () => {
    const { classes } = run(
      '<div class="nav"><span id="h" class="hidden">x</span></div>',
      '.nav .hidden { display: none } [data-vaul-handle-hitarea]: { color: red }',
    );
    expect(classes('#h')).toEqual(['site-hidden']);
  });

  it('wraps the remaining CSS in layers below Tailwind', () => {
    const { css, result } = run(
      '<div class="nav"><a>x</a></div>',
      '@layer base { a { color: red } } .nav a { color: blue } @font-face { font-family: X; src: url(x.woff2) }',
    );
    expect(result.layers).toEqual(['dittu-base', 'dittu-unlayered']);
    expect(css).toMatch(/@layer dittu-unlayered\s*{\s*\.nav a/);
    expect(css).toMatch(/}\s*@font-face/);
    expect(css).not.toMatch(/dittu-unlayered[^}]*@font-face/);
  });
});

describe('sites built with Tailwind v4', () => {
  const css = `
@layer theme { :root, :host { --spacing: .25rem; --color-zinc-900: #18181b; --color-brand: #ff2a68 } }
@layer base { *, ::after, ::before { margin: 0; padding: 0 } }
@layer utilities {
  .p-4 { padding: calc(var(--spacing)*4) }
  .text-zinc-900 { color: var(--color-zinc-900) }
  .bg-brand { background-color: var(--color-brand) }
  .dark\\:text-white:is(.dark *) { color: var(--color-white) }
  @media (width >= 48rem) { .md\\:p-8 { padding: calc(var(--spacing)*8) } }
}`;

  it('detects the theme and a class-based dark variant', () => {
    const theme = detectTheme([css]);
    expect(theme?.vars).toContainEqual(['--color-brand', '#ff2a68']);
    expect(theme?.dark).toBe(':is(.dark *)');
  });

  it('keeps the site’s own classes when Tailwind regenerates them exactly', async () => {
    const themed = await TailwindCompiler.create(detectTheme([css]));
    const body = fromHtml('<div id="d" class="p-4 md:p-8 text-zinc-900 bg-brand dark:text-white">x</div>', {
      fragment: true,
    }) as Root;
    const r = convertPage({ body, css, htmlAttrs: [], bodyAttrs: [], toggled: new Set() }, themed, new Set());
    const div = body.children[0] as Element;
    expect(div.properties.className).toEqual(['p-4', 'md:p-8', 'text-zinc-900', 'bg-brand', 'dark:text-white']);
    expect(r.stats.converted).toBe(5);
    expect(r.css.toString()).not.toContain('.p-4');
    expect(r.css.toString()).toContain('--color-brand');
  });
});

describe('marker classes of reused rules', () => {
  it('keeps `group` when group-hover classes are reused', async () => {
    const theme = { vars: [['--spacing', '.25rem']] as [string, string][] };
    const themed = await TailwindCompiler.create(theme);
    const [rule] = themed.css(['group-hover:underline']);
    const css = `@layer theme { :root, :host { --spacing: .25rem } } @layer utilities { ${rule} }`;
    const body = fromHtml('<a id="a" class="group"><span id="s" class="group-hover:underline">x</span></a>', {
      fragment: true,
    }) as Root;
    const r = convertPage({ body, css, htmlAttrs: [], bodyAttrs: [], toggled: new Set() }, themed, new Set());
    const a = body.children[0] as Element;
    expect(r.stats.converted).toBe(1);
    expect(a.properties.className).toEqual(['group']);
    expect((a.children[0] as Element).properties.className).toEqual(['group-hover:underline']);
  });
});

describe('sameValue', () => {
  it('treats inlined theme values and equivalent colors as equal', () => {
    expect(sameValue('calc(0.25rem * 4)', '1rem')).toBe(true);
    expect(sameValue('.5rem', '0.5rem')).toBe(true);
    expect(sameValue('#fff', 'white')).toBe(true);
    expect(sameValue("url('/a.png')", 'url("/a.png")')).toBe(true);
    expect(sameValue('url(/A.png)', 'url(/a.png)')).toBe(false);
    expect(sameValue('var(--tw-ease,var(--x))', 'var(--tw-ease, var(--x))')).toBe(true);
    expect(sameValue('calc(var(--spacing)*2)', 'calc(var(--spacing) * 2)')).toBe(true);
    expect(sameValue('0.3s', '300ms')).toBe(true);
    expect(sameValue('.6', '60%', 'opacity')).toBe(true);
    expect(sameValue('.6', '60%', 'width')).toBe(false);
    expect(sameValue("'a, b'", "'a,b'")).toBe(false);
  });
});

describe('versions', () => {
  it('generated projects use the Tailwind version dittu converts with', () => {
    const installed = createRequire(import.meta.url)('tailwindcss/package.json').version;
    expect(VERSIONS.tailwind).toBe(installed);
  });
});
