import { resolve } from 'node:path';
import * as z from 'zod';
import { DEFAULTS, defaultOutDir } from '../config/defaults.js';
import type { Target, VerifyReport } from '../domain/report.js';
import { readManifest, readReport } from '../pipeline/manifest.js';
import { cloneAndVerify } from '../pipeline/run.js';
import { verify } from '../verify/verify.js';

const frameworks = z.array(z.enum(['next', 'astro']));

export const cloneInput = z.object({
  url: z.string().describe('Page to clone, e.g. https://example.com'),
  outDir: z.string().optional().describe('Output directory (default ./dittu-out/<host>)'),
  frameworks: frameworks.optional().describe('Projects to generate (default next + astro)'),
  styling: z
    .enum(['css', 'tailwind'])
    .optional()
    .describe(
      'css keeps the original stylesheet (default); tailwind converts class rules to Tailwind utilities wherever that renders identically and keeps the rest as CSS',
    ),
  pages: z.number().int().min(1).max(50).optional().describe('Crawl up to n same-site pages (default 1)'),
  verify: z.boolean().optional().describe('Score the clone against the original (default true)'),
  build: z.boolean().optional().describe('Also npm install + build + score the generated apps (slow, default false)'),
  remove: z.array(z.string()).optional().describe('CSS selectors to drop (cookie banners, chat widgets)'),
  waitMs: z.number().int().min(0).max(30_000).optional().describe('Extra wait after load in ms'),
});

export const verifyInput = z.object({
  outDir: z.string().describe('Output directory of a previous clone'),
  targets: z
    .array(z.enum(['preview', 'next', 'astro']))
    .optional()
    .describe('What to score (default preview)'),
  widths: z.array(z.number().int().min(200).max(4000)).optional().describe('Viewport widths (default 1440, 390)'),
});

export const reportInput = z.object({
  outDir: z.string().describe('Output directory of a previous clone'),
});

/** Compact, model-friendly view of a verify report. */
export function scoreTable(report: VerifyReport | null) {
  if (!report) return { scores: [], lowest: null, passed: null, errors: [] as string[] };
  const scores = report.results.map((r) => ({
    target: r.target,
    route: r.route,
    width: r.width,
    score: Number((r.diff.score * 100).toFixed(2)),
    worstBandsY: r.diff.worstBands.map((b) => b.y),
    diffImage: r.diffImage,
  }));
  const lowest = scores.length ? Math.min(...scores.map((s) => s.score)) : null;
  return { scores, lowest, passed: lowest === null ? null : lowest >= DEFAULTS.passScore * 100, errors: report.errors };
}

const text = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  structuredContent: data as Record<string, unknown>,
});

export async function cloneTool(input: z.infer<typeof cloneInput>) {
  const url = /^https?:\/\//.test(input.url) ? input.url : `https://${input.url}`;
  const outDir = resolve(input.outDir ?? defaultOutDir(url));
  const { clone, report } = await cloneAndVerify({
    url,
    outDir,
    frameworks: input.frameworks ?? [...DEFAULTS.frameworks],
    pages: input.pages ?? 1,
    viewport: DEFAULTS.viewport,
    mobile: DEFAULTS.mobile,
    breakpoint: DEFAULTS.breakpoint,
    remove: input.remove ?? [],
    waitMs: input.waitMs ?? DEFAULTS.waitMs,
    split: true,
    format: true,
    styling: input.styling ?? DEFAULTS.styling,
    verify: input.verify ?? true,
    build: input.build ?? false,
    widths: [...DEFAULTS.verifyWidths],
  });
  return text({
    outDir,
    outputs: clone.outputs,
    pages: clone.manifest.pages,
    ...scoreTable(report),
    warnings: clone.warnings,
    failedAssets: clone.failedAssets.length,
  });
}

export async function verifyTool(input: z.infer<typeof verifyInput>) {
  const outDir = resolve(input.outDir);
  const report = await verify({
    outDir,
    manifest: readManifest(outDir),
    targets: (input.targets ?? ['preview']) as Target[],
    widths: input.widths ?? [...DEFAULTS.verifyWidths],
  });
  return text({ outDir, ...scoreTable(report) });
}

export async function reportTool(input: z.infer<typeof reportInput>) {
  const outDir = resolve(input.outDir);
  return text({ outDir, manifest: readManifest(outDir), ...scoreTable(readReport(outDir)) });
}
