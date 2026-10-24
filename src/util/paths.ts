import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Package root (works from src/ under tsx and from dist/ after a build). */
export const pkgRoot = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return dir;
})();

const cache = new Map<string, string>();

/** Source of a script under bridge/ (code that runs inside the browser or the generated site). */
export function readBridge(rel: string): string {
  let s = cache.get(rel);
  if (s === undefined) {
    s = readFileSync(join(pkgRoot, 'bridge', rel), 'utf8');
    cache.set(rel, s);
  }
  return s;
}

export const bridgePath = (rel: string) => join(pkgRoot, 'bridge', rel);

/**
 * Source of a page-side call: bridge/browser scripts are single function
 * expressions (`(arg) => {...}`), invoked here with a JSON argument.
 */
export function bridgeCall(rel: string, arg?: unknown): string {
  const expr = readBridge(rel).trim().replace(/;+$/, '');
  return `(${expr})(${arg === undefined ? '' : JSON.stringify(arg)})`;
}
