import type { Viewport } from './snapshot.js';

export type Framework = 'next' | 'astro';
export type Target = 'preview' | Framework;
export type Styling = 'css' | 'tailwind';

/** dittu.json — written by `clone`, read by `verify` and the MCP server. */
export interface Manifest {
  startUrl: string;
  viewport: Viewport;
  pages: { route: string; url: string }[];
  frameworks: Framework[];
  styling?: Styling;
}

export interface DiffResult {
  /** 1 − differing pixels / total pixels, over the union of both images. */
  score: number;
  width: number;
  heightA: number;
  heightB: number;
  diffPixels: number;
  /** Worst horizontal bands, to locate where the clone deviates. */
  worstBands: { y: number; height: number; score: number }[];
}

export interface VerifyResult {
  target: Target;
  route: string;
  width: number;
  diff: DiffResult;
  diffImage: string;
}

export interface VerifyReport {
  results: VerifyResult[];
  errors: string[];
}
