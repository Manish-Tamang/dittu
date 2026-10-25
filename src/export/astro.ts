import { cpSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, ElementContent, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { format } from 'prettier';
import { VERSIONS } from '../config/defaults.js';
import { routeSegments, type SiteModel } from '../domain/site.js';
import {
  EACH,
  LOOP,
  MAP,
  MARK,
  SLOT,
  STYLE_SLOT,
  USE,
  type ComponentDef,
  type PropType,
  type PropValue,
  type Reconstruction,
} from '../reconstruct/ir.js';
import { collectionNames } from '../reconstruct/naming.js';
import { importPath, writeFile as write } from './files.js';
import { newJsxContext, printExpr, valueExpr, type JsxContext } from './jsx.js';
import { attrString, iconAttrs, motionJson } from './markup.js';
import { projectReadme } from './readme.js';
import { destructure } from './types.js';

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const ATTR_SLOT_RE = new RegExp(`([\\w:.-]+)="${MARK}([\\w.]+)${MARK}"`, 'g');

const componentFile = (dir: string, def: ComponentDef) =>
  join(dir, 'src', 'components', def.scope, `${def.name}.astro`);

/** Astro has no React types: style is a string or object, components are any Astro component. */
function astroType(t: PropType): string {
  switch (t.kind) {
    case 'string':
      return 'string';
    case 'style':
      return 'string | Record<string, string>';
    case 'component':
      return 'any';
    case 'list':
      return t.item === 'string'
        ? 'string[]'
        : `{ ${t.item.map((p) => `${p.name}: ${astroType(p.type)}`).join('; ')} }[]`;
  }
}

const escText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

/** `<tag a="b"` for an element (attributes stringified like the static preview, SVG names inside <svg>). */
function openTag(el: Element, inSvg: boolean): string {
  const { [STYLE_SLOT]: styleSlot, dataDittuSpreadProps, ...properties } = el.properties;
  const shallow = toHtml(
    { type: 'element', tagName: el.tagName, properties, children: [] },
    // Keep `'` raw: Tailwind scans the source, and `&#x27;` inside a class would not match the real class.
    { space: inSvg ? 'svg' : 'html', allowDangerousCharacters: true },
  );
  // Whatever closing form the serializer chose (`></x>`, `>`, ` />`), keep only the opening part.
  let open = shallow.replace(/<\/[^<>]+>$/, '').replace(/\s*\/?>$/, '');
  open = open.replace(ATTR_SLOT_RE, '$1={$2}');
  if (styleSlot) open += ` style={${styleSlot}}`;
  if (dataDittuSpreadProps !== undefined) open += ' {...props}';
  return open;
}

export class AstroWriter {
  constructor(
    private ctx: JsxContext,
    private aliases: Map<string, string>,
  ) {}

  node(n: ElementContent, inSvg = false): string {
    if (n.type === 'text') return escText(n.value);
    if (n.type !== 'element') return '';
    const svg = inSvg || n.tagName === 'svg';
    const p = n.properties;
    if (n.tagName === SLOT) return `{${p.dataPath}}`;
    if (n.tagName === EACH) {
      const inner = n.children.map((c) => this.node(c, inSvg)).join('');
      return `{${p.dataPath}.map((${p.dataItem}) => (${inner}))}`;
    }
    if (n.tagName === LOOP) {
      const name = this.constName(String(p.dataVar));
      this.ctx.consts.push({
        name,
        type: JSON.parse(String(p.dataType)) as PropType,
        items: JSON.parse(String(p.dataItems)) as PropValue[],
      });
      const inner = n.children.map((c) => this.node(c, inSvg)).join('');
      return `{${name}.map((${p.dataItem}) => (${inner}))}`;
    }
    if (n.tagName === MAP) {
      const component = String(p.dataComponent);
      this.ctx.used.add(component);
      const name = this.constName(String(p.dataVar));
      this.ctx.consts.push({ name, component, items: JSON.parse(String(p.dataItems)) as PropValue[] });
      const item = collectionNames(component).item;
      return `{${name}.map((${item}) => <${component} {...${item}} />)}`;
    }
    if (n.tagName === USE) {
      const slot = p.dataSlot ? String(p.dataSlot) : null;
      const component = slot ? (this.aliases.get(slot) ?? slot) : String(p.dataComponent);
      if (!slot) this.ctx.used.add(component);
      const def = slot ? undefined : this.ctx.components.get(component);
      const { dataSlot: _s, dataComponent: _c, dataProps, ...rest } = p;
      let out = openTag({ type: 'element', tagName: 'x', properties: rest, children: [] }, false).replace(
        /^<x/,
        `<${component}`,
      );
      for (const [k, v] of Object.entries(JSON.parse(String(dataProps ?? '{}')) as Record<string, PropValue>)) {
        const type = def?.props.find((d) => d.name === k)?.type;
        // Quoted component props are passed literally (no entity decoding), so anything
        // beyond plain text goes in as a JS string expression.
        out +=
          typeof v === 'string' && type?.kind !== 'style' && !/["&<>{}\\\n]/.test(v)
            ? ` ${k}="${v}"`
            : ` ${k}={${printExpr(valueExpr(v, type, this.ctx))}}`;
      }
      return out + ' />';
    }
    const open = openTag(n, svg);
    if (!svg && VOID.has(n.tagName)) return open + '>';
    if (svg && !n.children.length) return open + ' />';
    return `${open}>${n.children.map((c) => this.node(c, svg)).join('')}</${n.tagName}>`;
  }

  constName(base: string): string {
    let name = base;
    for (let i = 2; this.ctx.constNames.has(name); i++) name = `${base}${i}`;
    this.ctx.constNames.add(name);
    return name;
  }

  tree(t: Root | Element): string {
    return t.type === 'root' ? t.children.map((c) => this.node(c as ElementContent)).join('') : this.node(t);
  }
}

function frontmatter(file: string, dir: string, ctx: JsxContext, self: string | null, extra: string[]): string {
  // Data constants first: components they reference (icons in a list) need imports too.
  const consts = ctx.consts.map((c) => {
    const type: PropType | undefined = c.component
      ? { kind: 'list', item: ctx.components.get(c.component)!.props }
      : c.type;
    return `const ${c.name} = ${printExpr(valueExpr(c.items, type, ctx))};`;
  });
  const lines: string[] = [];
  for (const name of [...ctx.used].toSorted()) {
    if (name === self) continue;
    const def = ctx.components.get(name);
    if (def) lines.push(`import ${name} from '${importPath(file, componentFile(dir, def))}';`);
  }
  return [...lines, ...extra, ...consts].join('\n');
}

async function formatAstro(src: string, enabled: boolean): Promise<string> {
  if (!enabled) return src;
  try {
    return await format(src, {
      parser: 'astro',
      plugins: ['prettier-plugin-astro'],
      printWidth: 100,
      htmlWhitespaceSensitivity: 'strict',
    });
  } catch {
    return src;
  }
}

export async function exportAstro(site: SiteModel, recon: Reconstruction, outDir: string, opts: { format: boolean }) {
  const dir = join(outDir, 'astro');
  const components = new Map(recon.components.map((c) => [c.name, c]));
  const first = site.pages[0];

  write(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'dittu-clone-astro',
        private: true,
        type: 'module',
        scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
        dependencies: {
          astro: VERSIONS.astro,
          ...(site.tailwind ? { tailwindcss: VERSIONS.tailwind, '@tailwindcss/vite': VERSIONS.tailwind } : {}),
        },
      },
      null,
      2,
    ) + '\n',
  );
  write(
    join(dir, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';${site.tailwind ? "\nimport tailwindcss from '@tailwindcss/vite';" : ''}

export default defineConfig({
  // Keep whitespace exactly as captured: it affects inline layout.
  compressHTML: false,${site.tailwind ? '\n  vite: { plugins: [tailwindcss()] },' : ''}
});
`,
  );
  write(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      { extends: 'astro/tsconfigs/base', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist'] },
      null,
      2,
    ) + '\n',
  );
  write(join(dir, '.gitignore'), 'node_modules\ndist\n.astro\n');
  if (site.tailwind) write(join(dir, 'src', 'styles', 'global.css'), site.tailwind.input);

  write(
    join(dir, 'src', 'layouts', 'Layout.astro'),
    `---${site.tailwind ? "\nimport '../styles/global.css';" : ''}
interface Props {
  title: string;
  description?: string;
  css: string;
  icons?: { rel: string; href: string; type?: string; sizes?: string }[];
  motion?: string;
}
const { title, description, css, icons = [], motion = '[]' } = Astro.props;
---
<!doctype html>
<html${attrString(first.htmlAttrs)}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    {icons.map((i) => <link rel={i.rel} href={i.href} type={i.type} sizes={i.sizes} />)}
    <link rel="stylesheet" href={css} />
  </head>
  <body${attrString(first.bodyAttrs)}><slot /><script type="application/json" id="dittu-motion" set:html={motion}></script><script is:inline src="/assets/dittu-motion.js" defer></script></body>
</html>
`,
  );

  for (const def of recon.components) {
    const file = componentFile(dir, def);
    const ctx = newJsxContext(components, false);
    if (def.kind === 'icon') {
      const root: Element = { ...def.root, properties: { ...def.root.properties, dataDittuSpreadProps: '' } };
      const body = new AstroWriter(ctx, new Map()).tree(root);
      write(file, await formatAstro(`---\nconst props = Astro.props;\n---\n${body}\n`, opts.format));
      continue;
    }
    const { pattern, aliases } = destructure(def);
    const body = new AstroWriter(ctx, aliases).tree(def.root);
    const extra = def.props.length
      ? [
          `interface Props {\n${def.props.map((p) => `  ${p.name}: ${astroType(p.type)};`).join('\n')}\n}`,
          `const ${pattern} = Astro.props;`,
        ]
      : [];
    const fm = frontmatter(file, dir, ctx, def.name, extra);
    write(file, await formatAstro(`${fm ? `---\n${fm}\n---\n` : ''}${body}\n`, opts.format));
  }

  for (const { page, root } of recon.pages) {
    const segs = routeSegments(page.route);
    const file = join(
      dir,
      'src',
      'pages',
      ...(segs.length ? [...segs.slice(0, -1), `${segs.at(-1)}.astro`] : ['index.astro']),
    );
    const ctx = newJsxContext(components, false);
    const body = new AstroWriter(ctx, new Map()).tree(root);
    const props = {
      title: page.title,
      description: page.description,
      css: page.css,
      icons: page.icons.map((i) => Object.fromEntries(iconAttrs(i))),
      motion: motionJson(page),
    };
    const fm = frontmatter(file, dir, ctx, null, [
      `import Layout from '${importPath(file, join(dir, 'src', 'layouts', 'Layout.astro'))}';`,
      `const props = ${JSON.stringify(props, null, 2)};`,
    ]);
    write(file, await formatAstro(`---\n${fm}\n---\n<Layout {...props}>${body}</Layout>\n`, opts.format));
  }

  cpSync(join(outDir, 'assets'), join(dir, 'public', 'assets'), { recursive: true });
  write(join(dir, 'README.md'), projectReadme(site, 'astro'));
  return dir;
}
