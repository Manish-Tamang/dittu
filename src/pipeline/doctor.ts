import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const NODE_MIN = 20;

/** Everything dittu needs at runtime, with a concrete fix for each failure. */
export async function runDoctor(): Promise<Check[]> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js',
    ok: major >= NODE_MIN,
    detail: `v${process.versions.node}`,
    fix: major >= NODE_MIN ? undefined : `Install Node.js ${NODE_MIN} or newer.`,
  });

  const exe = chromium.executablePath();
  const installed = existsSync(exe);
  checks.push({
    name: 'Chromium (Playwright)',
    ok: installed,
    detail: installed ? exe : 'not installed',
    fix: installed ? undefined : 'npx playwright install chromium',
  });

  if (installed) {
    try {
      const browser = await chromium.launch({ channel: 'chromium', headless: true });
      const version = browser.version();
      await browser.close();
      checks.push({ name: 'Chromium launches', ok: true, detail: version });
    } catch (err) {
      const msg = (err as Error).message;
      const missing = [...new Set([...msg.matchAll(/(lib[\w.+-]+\.so[\w.]*)/g)].map((m) => m[1]))];
      checks.push({
        name: 'Chromium launches',
        ok: false,
        detail: missing.length ? `missing system libraries: ${missing.join(', ')}` : msg.split('\n')[0],
        fix: 'sudo npx playwright install-deps chromium',
      });
    }
  }

  let npm = '';
  try {
    npm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  } catch {}
  checks.push({
    name: 'npm (for --build)',
    ok: Boolean(npm),
    detail: npm ? `v${npm}` : 'not found',
    fix: npm ? undefined : 'Install npm to build and verify the generated projects.',
  });
  return checks;
}
