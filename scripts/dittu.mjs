#!/usr/bin/env node
// CLI entry (package "bin"). Runs the compiled build, or the TypeScript
// sources through tsx when working from a checkout without a build.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/main.js', import.meta.url);
if (existsSync(fileURLToPath(dist))) {
  await import(dist.href);
} else {
  const { register } = await import('tsx/esm/api');
  register();
  await import(new URL('../src/main.ts', import.meta.url).href);
}
