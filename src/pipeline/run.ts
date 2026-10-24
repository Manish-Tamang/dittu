import type { Target, VerifyReport } from '../domain/report.js';
import { log } from '../util/log.js';
import { verify } from '../verify/verify.js';
import { clone, type CloneOptions, type CloneResult } from './clone.js';

export interface RunOptions extends CloneOptions {
  verify: boolean;
  /** Also install, build and score the generated Next/Astro apps. */
  build: boolean;
  widths: number[];
}

/** Clone, then verify: what `dittu clone` and the `clone_website` MCP tool do. */
export async function cloneAndVerify(opts: RunOptions): Promise<{ clone: CloneResult; report: VerifyReport | null }> {
  const t0 = Date.now();
  const result = await clone(opts);
  log.ok(`Cloned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!opts.verify) return { clone: result, report: null };
  log.step('Verifying');
  const targets: Target[] = ['preview', ...(opts.build ? opts.frameworks : [])];
  const report = await verify({ outDir: opts.outDir, manifest: result.manifest, targets, widths: opts.widths });
  return { clone: result, report };
}
