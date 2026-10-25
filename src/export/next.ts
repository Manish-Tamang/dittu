import { cpSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Root } from 'hast';
import { VERSIONS } from '../config/defaults.js';
import { routeSegments, type SiteModel } from '../domain/site.js';
import type { ComponentDef, Reconstruction } from '../reconstruct/ir.js';
import { importPath, writeFile as write } from './files.js';
import { formatCode, jsxAttributes, newJsxContext, printExpr, toJsx, valueExpr, type JsxContext } from './jsx.js';
import { motionJson } from './markup.js';
import { projectReadme } from './readme.js';
import { destructure, propsInterface, reactTypesFor } from './types.js';

/** HTML attributes missing from React's HTMLAttributes typings (checked against @types/react 19). */
const LEGACY_ATTRIBUTES = [
  'background',
  'bgColor',
  'border',
  'clear',
  'compact',
  'face',
  'hSpace',
  'noShade',
  'noWrap',
  'vAlign',
  'vSpace',
];

const componentFile = (dir: string, def: ComponentDef) => join(dir, 'components', def.scope, `${def.name}.tsx`);

/** Imports + data constants for a module, once its JSX has been generated (which fills `ctx`). */
function moduleHeader(
  file: string,
  dir: string,
  ctx: JsxContext,
  self: string | null,
  extraReactTypes: Set<string>,
): string {
  const consts = ctx.consts.map((c) => {
    if (!c.component) return `const ${c.name} = ${printExpr(valueExpr(c.items, c.type, ctx))};`;
    const def = ctx.components.get(c.component)!;
    const value = printExpr(valueExpr(c.items, { kind: 'list', item: def.props }, ctx));
    return `const ${c.name}: ${c.component}Props[] = ${value};`;
  });
  const typed = new Set(ctx.consts.map((c) => c.component));
  const lines: string[] = [];
  const reactTypes = [...extraReactTypes].toSorted();
  if (reactTypes.length) lines.push(`import type { ${reactTypes.join(', ')} } from "react";`);
  for (const name of [...ctx.used].toSorted()) {
    if (name === self) continue;
    const def = ctx.components.get(name);
    if (!def) continue;
    const path = importPath(file, componentFile(dir, def).replace(/\.tsx$/, ''));
    lines.push(
      typed.has(name) ? `import ${name}, { type ${name}Props } from "${path}";` : `import ${name} from "${path}";`,
    );
  }
  if (ctx.needsCss) lines.push(`import { css } from "${importPath(file, join(dir, 'lib', 'css'))}";`);
  return [lines.join('\n'), consts.join('\n\n')].filter(Boolean).join('\n\n');
}

function componentSource(def: ComponentDef, dir: string, components: Map<string, ComponentDef>): string {
  const file = componentFile(dir, def);
  const ctx = newJsxContext(components);
  if (def.kind === 'icon') {
    const root: Element = { ...def.root, properties: { ...def.root.properties, dataDittuSpreadProps: '' } };
    const body = toJsx(root, ctx);
    return `import type { SVGProps } from "react";

export default function ${def.name}(props: SVGProps<SVGSVGElement>) {
  return (
    ${body}
  );
}
`;
  }
  const { pattern, aliases } = destructure(def);
  const body = toJsx(def.root, ctx, aliases);
  const header = moduleHeader(file, dir, ctx, def.name, reactTypesFor(def.props));
  const signature = def.props.length ? `${pattern}: ${def.name}Props` : '';
  return `${header}${header ? '\n\n' : ''}${propsInterface(def)}${def.props.length ? '\n' : ''}export default function ${def.name}(${signature}) {
  return (
    ${body}
  );
}
`;
}

/** Tags with a dash are custom elements; TypeScript needs to know about them. */
function customElements(trees: (Root | Element)[]): string[] {
  const found = new Set<string>();
  const visit = (n: Root | Element) => {
    for (const c of n.children) {
      if (c.type !== 'element') continue;
      if (c.tagName.includes('-') && !c.tagName.startsWith('dittu-')) found.add(c.tagName);
      visit(c);
    }
  };
  trees.forEach(visit);
  return [...found].toSorted();
}

export async function exportNext(site: SiteModel, recon: Reconstruction, outDir: string, opts: { format: boolean }) {
  const dir = join(outDir, 'next');
  const fmt = (code: string) => (opts.format ? formatCode(code, 'typescript') : Promise.resolve(code));
  const components = new Map(recon.components.map((c) => [c.name, c]));
  const first = site.pages[0];

  write(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'dittu-clone-next',
        private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
        dependencies: { next: VERSIONS.next, react: VERSIONS.react, 'react-dom': VERSIONS.react },
        devDependencies: {
          ...(site.tailwind
            ? { tailwindcss: VERSIONS.tailwind, '@tailwindcss/postcss': VERSIONS.tailwind, postcss: VERSIONS.postcss }
            : {}),
          typescript: VERSIONS.typescript,
          '@types/react': VERSIONS.typesReact,
          '@types/react-dom': VERSIONS.typesReact,
          '@types/node': VERSIONS.typesNode,
        },
      },
      null,
      2,
    ) + '\n',
  );
  write(
    join(dir, 'next.config.ts'),
    `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a lockfile in a parent folder isn't picked up.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
`,
  );
  write(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['dom', 'dom.iterable', 'esnext'],
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ) + '\n',
  );
  write(join(dir, '.gitignore'), 'node_modules\n.next\nout\nnext-env.d.ts\n*.tsbuildinfo\n');
  if (site.tailwind) {
    write(join(dir, 'postcss.config.mjs'), `export default {\n  plugins: { "@tailwindcss/postcss": {} },\n};\n`);
    write(join(dir, 'app', 'globals.css'), site.tailwind.input);
  }
  write(
    join(dir, 'lib', 'css.ts'),
    `import type { CSSProperties } from "react";

/** Style object with CSS custom properties (React's types don't list \`--*\` keys). */
export const css = (style: Record<string, string | number>) => style as CSSProperties;
`,
  );
  // Legacy presentational attributes React renders but its types don't list (`<img border="0">`).
  write(
    join(dir, 'types', 'legacy-attributes.d.ts'),
    `import "react";

declare module "react" {
  interface HTMLAttributes<T> {
${LEGACY_ATTRIBUTES.map((a) => `    ${a}?: string | number | boolean;`).join('\n')}
  }
}
`,
  );
  const custom = customElements([...recon.pages.map((p) => p.root), ...recon.components.map((c) => c.root)]);
  if (custom.length) {
    write(
      join(dir, 'types', 'custom-elements.d.ts'),
      `import type { DetailedHTMLProps, HTMLAttributes } from "react";

type CustomElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
${custom.map((t) => `      "${t}": CustomElement;`).join('\n')}
    }
  }
}
`,
    );
  }

  write(
    join(dir, 'app', 'layout.tsx'),
    await fmt(`import type { ReactNode } from "react";${site.tailwind ? '\nimport "./globals.css";' : ''}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html${jsxAttributes(first.htmlAttrs)} suppressHydrationWarning>
      <body${jsxAttributes(first.bodyAttrs)}>{children}</body>
    </html>
  );
}
`),
  );

  for (const def of recon.components) {
    write(componentFile(dir, def), await fmt(componentSource(def, dir, components)));
  }

  for (const { page, root } of recon.pages) {
    const file = join(dir, 'app', ...routeSegments(page.route), 'page.tsx');
    const ctx = newJsxContext(components);
    const body = toJsx(root, ctx);
    const header = moduleHeader(file, dir, ctx, null, new Set());
    const metadata: Record<string, unknown> = { title: page.title };
    if (page.description) metadata.description = page.description;
    if (page.icons.length)
      metadata.icons = page.icons.map((i) => ({
        rel: i.rel,
        url: i.href,
        ...(i.type ? { type: i.type } : {}),
        ...(i.sizes ? { sizes: i.sizes } : {}),
      }));
    const src = `import type { Metadata } from "next";
${header}

export const metadata: Metadata = ${JSON.stringify(metadata, null, 2)};

const motion = ${JSON.stringify(motionJson(page))};

export default function Page() {
  return (
    <>
      <link rel="stylesheet" href="${page.css}" precedence="default" />
      ${body}
      <script type="application/json" id="dittu-motion" dangerouslySetInnerHTML={{ __html: motion }} />
      <script src="/assets/dittu-motion.js" defer />
    </>
  );
}
`;
    write(file, await fmt(src));
  }

  cpSync(join(outDir, 'assets'), join(dir, 'public', 'assets'), { recursive: true });
  write(join(dir, 'README.md'), projectReadme(site, 'next'));
  return dir;
}
