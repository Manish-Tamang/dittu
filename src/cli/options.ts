import type { Viewport } from '../domain/snapshot.js';

export const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function parseViewport(v: string): Viewport {
  const m = /^(\d+)x(\d+)$/.exec(v);
  if (!m) throw new Error(`Invalid viewport "${v}", expected WIDTHxHEIGHT`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const withScheme = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
