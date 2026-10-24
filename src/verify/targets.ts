import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { Target } from '../domain/report.js';
import { log } from '../util/log.js';
import { sleep } from '../util/time.js';
import { serveStatic } from './staticServer.js';

export interface RunningTarget {
  url: string;
  stop: () => void;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });

function run(cmd: string, args: string[], cwd: string, logFile: string, background = false): Promise<ChildProcess> {
  const out = createWriteStream(logFile, { flags: 'a' });
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ASTRO_TELEMETRY_DISABLED: '1' },
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  if (background) return Promise.resolve(child);
  return new Promise((resolve, reject) => {
    child.on('exit', (code) =>
      code === 0 ? resolve(child) : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code} (see ${logFile})`)),
    );
    child.on('error', reject);
  });
}

async function waitForHttp(url: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Server at ${url} did not start`);
}

/** Serve a clone target: the static preview directly, generated apps after install + build. */
export async function startTarget(target: Target, outDir: string): Promise<RunningTarget> {
  if (target === 'preview') {
    const { url, server } = await serveStatic([
      ['/', join(outDir, 'preview')],
      ['/assets/', join(outDir, 'assets')],
    ]);
    return { url, stop: () => server.close() };
  }
  const dir = join(outDir, target);
  const logFile = join(outDir, 'report', `${target}-build.log`);
  log.info(`${target}: npm install && build (log: ${logFile})`);
  // Always install: a re-clone may change dependencies (fast when node_modules is current).
  await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir, logFile);
  if (target === 'next') {
    await run('npx', ['next', 'build'], dir, logFile);
    const port = await freePort();
    const child = await run('npx', ['next', 'start', '-p', String(port), '-H', '127.0.0.1'], dir, logFile, true);
    const url = `http://127.0.0.1:${port}`;
    await waitForHttp(url, 60_000);
    return { url, stop: () => child.kill('SIGTERM') };
  }
  await run('npx', ['astro', 'build'], dir, logFile);
  const { url, server } = await serveStatic([['/', join(dir, 'dist')]]);
  return { url, stop: () => server.close() };
}
