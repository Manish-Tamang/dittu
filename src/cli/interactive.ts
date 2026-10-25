import { isAbsolute, relative } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { DEFAULTS, defaultOutDir } from '../config/defaults.js';
import type { Framework, Styling } from '../domain/report.js';
import { withScheme } from './options.js';

/** Clone settings the prompts can fill in (mirrors the `clone` flags). */
export interface CloneAnswers {
  url?: string;
  out?: string;
  frameworks: Framework[];
  styling: Styling;
  pages: number;
  verify: boolean;
  build: boolean;
  mobile: boolean;
  breakpoint: number;
  remove: string[];
  waitMs: number;
}

/** Keys the user already set with flags: those questions are skipped. */
export type Explicit = Set<keyof CloneAnswers>;

export const canPrompt = () => Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);

class Cancelled extends Error {}

/** Unwrap a prompt result; Ctrl+C / Esc abort the whole flow. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) throw new Cancelled();
  return value as Exclude<T, symbol>;
}

const validUrl = (v: string | undefined) => {
  if (!v?.trim()) return 'Enter a URL, e.g. https://example.com';
  try {
    const u = new URL(withScheme(v.trim()));
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return 'That doesn’t look like a website address';
  } catch {
    return 'That doesn’t look like a website address';
  }
};

const positiveInt = (max: number) => (v: string | undefined) =>
  /^\d+$/.test(v ?? '') && Number(v) >= 1 && Number(v) <= max ? undefined : `Enter a number from 1 to ${max}`;

/**
 * Ask for everything the user didn't pass as a flag. Returns null when cancelled (Ctrl+C / Esc).
 */
export async function promptClone(current: CloneAnswers, explicit: Explicit): Promise<CloneAnswers | null> {
  const a = { ...current };
  try {
    p.intro(pc.inverse(' dittu clone '));

    if (!a.url) {
      a.url = withScheme(
        answer(
          await p.text({
            message: 'Which website should I clone?',
            placeholder: 'https://example.com',
            validate: validUrl,
          }),
        ).trim(),
      );
    }

    if (!explicit.has('frameworks')) {
      a.frameworks = answer(
        await p.multiselect<Framework>({
          message: `Export to which frameworks? ${pc.dim('(space to toggle, none = static preview only)')}`,
          options: [
            { value: 'next', label: 'Next.js', hint: 'App Router, React components (JSX)' },
            { value: 'astro', label: 'Astro', hint: '.astro components, zero JS by default' },
          ],
          initialValues: a.frameworks,
          required: false,
        }),
      );
    }

    if (!explicit.has('styling')) {
      a.styling = answer(
        await p.select<Styling>({
          message: 'How should styles be written?',
          options: [
            { value: 'css', label: 'Original CSS', hint: 'the site’s own stylesheet, highest fidelity' },
            {
              value: 'tailwind',
              label: 'Tailwind CSS',
              hint: 'utility classes where they render identically, the rest stays CSS',
            },
          ],
          initialValue: a.styling,
        }),
      );
    }

    if (!explicit.has('pages')) {
      const choice = answer(
        await p.select<number>({
          message: 'How much of the site?',
          options: [
            { value: 1, label: 'Just this page' },
            { value: 5, label: 'Up to 5 pages', hint: 'follows same-site links' },
            { value: 10, label: 'Up to 10 pages' },
            { value: 0, label: 'Custom…' },
          ],
          initialValue: a.pages === 1 || a.pages === 5 || a.pages === 10 ? a.pages : 1,
        }),
      );
      a.pages = choice
        ? choice
        : Number(
            answer(await p.text({ message: 'Maximum number of pages', initialValue: '20', validate: positiveInt(50) })),
          );
    }

    if (!explicit.has('verify') && !explicit.has('build')) {
      const mode = answer(
        await p.select<'preview' | 'build' | 'skip'>({
          message: 'Check the clone against the original?',
          options: [
            { value: 'preview', label: 'Yes, quick check', hint: 'scores the static preview, ~1 min' },
            ...(a.frameworks.length
              ? [
                  {
                    value: 'build' as const,
                    label: 'Yes, build and check the apps too',
                    hint: 'npm install + build, a few minutes',
                  },
                ]
              : []),
            { value: 'skip', label: 'No, just clone' },
          ],
          initialValue: a.build ? 'build' : a.verify ? 'preview' : 'skip',
        }),
      );
      a.verify = mode !== 'skip';
      a.build = mode === 'build';
    }

    if (!explicit.has('out')) {
      a.out = answer(
        await p.text({ message: 'Where should I save it?', initialValue: a.out ?? defaultOutDir(a.url) }),
      ).trim();
    }

    const advanced = answer(await p.confirm({ message: 'Change advanced settings?', initialValue: false }));
    if (advanced) {
      if (!explicit.has('mobile')) {
        a.mobile = answer(
          await p.confirm({
            message: `Also render at mobile width? ${pc.dim('(catches layout that JS computes per screen size)')}`,
            initialValue: a.mobile,
          }),
        );
      }
      if (a.mobile && !explicit.has('breakpoint')) {
        a.breakpoint = Number(
          answer(
            await p.text({
              message: 'Mobile layout applies below which width (px)?',
              initialValue: String(a.breakpoint),
              validate: positiveInt(4000),
            }),
          ),
        );
      }
      if (!explicit.has('remove')) {
        const remove = answer(
          await p.text({
            message: `Elements to leave out? ${pc.dim('(CSS selectors, comma-separated, e.g. cookie banners)')}`,
            placeholder: '#cookie-banner, .intercom-launcher',
            defaultValue: a.remove.join(', '),
          }),
        );
        a.remove = remove
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (!explicit.has('waitMs')) {
        a.waitMs = Number(
          answer(
            await p.text({
              message: `Extra wait after the page loads (ms)? ${pc.dim('(raise for slow or animated sites)')}`,
              initialValue: String(a.waitMs),
              validate: (v) => (/^\d+$/.test(v ?? '') ? undefined : 'Enter a number of milliseconds'),
            }),
          ),
        );
      }
    }

    p.note(summary(a), 'Ready to clone');
    if (!answer(await p.confirm({ message: 'Start?', initialValue: true }))) throw new Cancelled();
    return a;
  } catch (err) {
    if (err instanceof Cancelled) {
      p.cancel('Cancelled — nothing was written.');
      return null;
    }
    throw err;
  }
}

/** Shorter of the path as given and relative to the working directory. */
const displayPath = (dir: string) => {
  if (!isAbsolute(dir)) return dir;
  const rel = relative(process.cwd(), dir);
  return rel.length < dir.length ? rel : dir;
};

export function summary(a: CloneAnswers): string {
  const rows: [string, string][] = [
    ['Website', a.url ?? ''],
    [
      'Export',
      a.frameworks.length
        ? a.frameworks.map((f) => (f === 'next' ? 'Next.js' : 'Astro')).join(' + ') + ' + preview'
        : 'static preview only',
    ],
    ['Styles', a.styling === 'tailwind' ? 'Tailwind CSS (+ original CSS where needed)' : 'original CSS'],
    ['Pages', a.pages === 1 ? 'this page' : `up to ${a.pages}`],
    ['Check', a.build ? 'preview + built apps' : a.verify ? 'preview' : 'skip'],
    ['Save to', displayPath(a.out ?? defaultOutDir(a.url ?? 'https://site'))],
  ];
  if (!a.mobile) rows.push(['Mobile render', 'off']);
  else if (a.breakpoint !== DEFAULTS.breakpoint) rows.push(['Breakpoint', `${a.breakpoint}px`]);
  if (a.remove.length) rows.push(['Leave out', a.remove.join(', ')]);
  if (a.waitMs !== DEFAULTS.waitMs) rows.push(['Wait', `${a.waitMs} ms`]);
  return rows.map(([k, v]) => `${pc.dim(k.padEnd(14))}${v}`).join('\n');
}

/** Closing message with what to do next. */
export function outro(outDir: string, frameworks: Framework[], lowest: number | null) {
  const lines = [];
  if (lowest !== null) {
    const pct = (lowest * 100).toFixed(2) + '%';
    lines.push(`${lowest >= DEFAULTS.passScore ? pc.green('✓') : pc.yellow('!')} Lowest visual match: ${pc.bold(pct)}`);
  }
  for (const f of frameworks) {
    lines.push(`${pc.dim('$')} cd ${outDir}/${f} && npm install && npm run dev`);
  }
  lines.push(`${pc.dim('$')} dittu serve ${outDir}    ${pc.dim('# static preview')}`);
  p.note(lines.join('\n'), 'Next steps');
  p.outro('Done.');
}
