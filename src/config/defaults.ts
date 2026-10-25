import type { Styling } from '../domain/report.js';
import type { Viewport } from '../domain/snapshot.js';

/** Versions pinned in generated projects. */
export const VERSIONS = {
  next: '16.4.2',
  react: '19.3.1',
  astro: '7.4.2',
  // Next's build type-checks with the TypeScript JS API (5.x line).
  typescript: '5.9.3',
  typesReact: '19.3.0',
  typesNode: '24.19.2',
  // Same version dittu converts with (package.json "tailwindcss"), so builds match the preview.
  tailwind: '4.3.3',
  postcss: '8.5.31',
} as const;

export const DEFAULTS = {
  viewport: { width: 1440, height: 900 } satisfies Viewport,
  mobile: { width: 390, height: 844 } satisfies Viewport,
  /** Below this width the mobile render's JS-computed layout applies. */
  breakpoint: 768,
  waitMs: 1500,
  verifyWidths: [1440, 390],
  frameworks: ['next', 'astro'] as ('next' | 'astro')[],
  /** css: keep the original stylesheet; tailwind: convert class rules to utilities where lossless. */
  styling: 'css' as Styling,
  /** Fidelity target used for pass/fail reporting. */
  passScore: 0.95,
} as const;

/** Full-page screenshots are capped to keep diffs fast and memory bounded. */
export const MAX_SHOT_HEIGHT = 16_000;

export const MAX_ASSET_BYTES = 40 * 1024 * 1024;

/** ./dittu-out/<host> */
export const defaultOutDir = (url: string) => `dittu-out/${new URL(url).hostname}`;
