import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest, VerifyReport } from '../domain/report.js';

export function readManifest(outDir: string): Manifest {
  const file = join(outDir, 'dittu.json');
  if (!existsSync(file)) throw new Error(`${file} not found — run "dittu clone" first`);
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

export function readReport(outDir: string): VerifyReport | null {
  const file = join(outDir, 'report', 'report.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as VerifyReport) : null;
}
