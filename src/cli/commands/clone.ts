import { relative, resolve } from 'node:path';
import { Option, type Command } from 'commander';
import { DEFAULTS, defaultOutDir } from '../../config/defaults.js';
import type { Framework, Styling } from '../../domain/report.js';
import { cloneAndVerify } from '../../pipeline/run.js';
import { log } from '../../util/log.js';
import { banner } from '../banner.js';
import { canPrompt, outro, promptClone, type CloneAnswers, type Explicit } from '../interactive.js';
import { list, parseViewport, withScheme } from '../options.js';
import { printReport } from '../output.js';

const vp = (v: { width: number; height: number }) => `${v.width}x${v.height}`;

/** Commander option name → interactive answer key. */
const FLAG_KEYS: [string, keyof CloneAnswers][] = [
  ['framework', 'frameworks'],
  ['styling', 'styling'],
  ['pages', 'pages'],
  ['verify', 'verify'],
  ['build', 'build'],
  ['out', 'out'],
  ['mobile', 'mobile'],
  ['breakpoint', 'breakpoint'],
  ['remove', 'remove'],
  ['wait', 'waitMs'],
];

interface CloneFlags {
  out?: string;
  framework: string;
  styling: string;
  pages: string;
  viewport: string;
  mobile: string | false;
  breakpoint: string;
  widths: string;
  verify: boolean;
  build?: boolean;
  remove?: string[];
  wait: string;
  split: boolean;
  format: boolean;
  yes?: boolean;
}

const CLONE_OPTIONS: [flags: string, description: string, defaultValue?: string][] = [
  ['-o, --out <dir>', 'output directory (default: ./dittu-out/<host>)'],
  ['-f, --framework <list>', 'next, astro, or none', DEFAULTS.frameworks.join(',')],
  ['-s, --styling <mode>', 'css (original stylesheet) or tailwind (utility classes where lossless)', DEFAULTS.styling],
  ['-p, --pages <n>', 'crawl up to n same-site pages', '1'],
  ['--viewport <WxH>', 'capture viewport', vp(DEFAULTS.viewport)],
  ['--mobile <WxH>', 'second render to capture JS-computed mobile layout', vp(DEFAULTS.mobile)],
  ['--no-mobile', 'skip the mobile render'],
  ['--breakpoint <px>', 'width below which mobile layout applies', String(DEFAULTS.breakpoint)],
  ['--widths <list>', 'viewport widths to verify', DEFAULTS.verifyWidths.join(',')],
  ['--no-verify', 'skip visual verification'],
  ['--build', 'also install, build and verify the generated Next/Astro apps'],
  ['--remove <selectors...>', 'CSS selectors of elements to drop (cookie banners, chat widgets)'],
  ['--wait <ms>', 'extra wait after load', String(DEFAULTS.waitMs)],
  ['--no-split', 'keep each page in a single component'],
  ['--no-format', 'skip prettier formatting of generated code'],
  ['-y, --yes', 'no questions: use flags and defaults'],
];

/** The same flags on `clone` and on the root command (hidden from the root's help). */
function addCloneOptions(cmd: Command, hidden = false): Command {
  for (const [flags, description, defaultValue] of CLONE_OPTIONS) {
    const opt = new Option(flags, description).hideHelp(hidden);
    cmd.addOption(defaultValue === undefined ? opt : opt.default(defaultValue));
  }
  return cmd;
}

function parseStyling(v: string): Styling {
  if (v === 'css' || v === 'tailwind') return v;
  throw new Error(`Invalid --styling "${v}", expected css or tailwind`);
}

/** Shared by `dittu clone [url]`, `dittu [url]` and bare `dittu`. */
async function runClone(rawUrl: string | undefined, o: CloneFlags, cmd: Command) {
  const interactive = canPrompt() && !o.yes;
  if (!rawUrl && !interactive)
    throw new Error('Missing URL. Usage: dittu clone <url> (or run in a terminal for interactive mode)');
  if (process.stdout.isTTY) log.raw(banner());

  let a: CloneAnswers = {
    url: rawUrl ? withScheme(rawUrl) : undefined,
    out: o.out,
    frameworks: list(o.framework).filter((f): f is Framework => f === 'next' || f === 'astro'),
    styling: parseStyling(o.styling),
    pages: Math.max(1, Number(o.pages)),
    verify: o.verify,
    build: Boolean(o.build),
    mobile: o.mobile !== false,
    breakpoint: Number(o.breakpoint),
    remove: o.remove ?? [],
    waitMs: Number(o.wait),
  };

  if (interactive) {
    const explicit: Explicit = new Set(
      FLAG_KEYS.filter(([flag]) => cmd.getOptionValueSource(flag) === 'cli').map(([, key]) => key),
    );
    const answers = await promptClone(a, explicit);
    if (!answers) return;
    a = answers;
  }

  const url = a.url!;
  const outDir = resolve(a.out ?? defaultOutDir(url));
  const { report } = await cloneAndVerify({
    url,
    outDir,
    frameworks: a.frameworks,
    pages: a.pages,
    viewport: parseViewport(o.viewport),
    mobile: a.mobile ? parseViewport(typeof o.mobile === 'string' ? o.mobile : vp(DEFAULTS.mobile)) : null,
    breakpoint: a.breakpoint,
    remove: a.remove,
    waitMs: a.waitMs,
    split: o.split,
    format: o.format,
    styling: a.styling,
    verify: a.verify,
    build: a.build,
    widths: list(o.widths).map(Number),
  });
  if (report) printReport(report);
  if (interactive) {
    const lowest = report?.results.length ? Math.min(...report.results.map((r) => r.diff.score)) : null;
    outro(relative(process.cwd(), outDir) || '.', a.frameworks, lowest);
  }
}

export function registerClone(program: Command) {
  addCloneOptions(
    program
      .command('clone')
      .description('clone a page (or crawl a site) into a static preview, Next.js and Astro, then verify')
      .argument('[url]', 'page to clone (asked interactively when omitted)'),
  ).action(runClone);

  // `dittu` alone starts the interactive flow; `dittu <url>` is short for `dittu clone <url>`.
  addCloneOptions(program.argument('[url]', 'page to clone (same as "dittu clone <url>")'), true).action(
    async (url: string | undefined, o: CloneFlags, cmd: Command) => {
      if (!url && !canPrompt()) {
        program.help();
        return;
      }
      await runClone(url, o, cmd);
    },
  );
}
