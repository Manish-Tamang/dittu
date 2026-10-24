import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

export function writeFile(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Relative ES import specifier from one file to another (no extension handling). */
export function importPath(fromFile: string, toFile: string): string {
  const p = relative(dirname(fromFile), toFile).replace(/\\/g, '/');
  return p.startsWith('.') ? p : './' + p;
}
