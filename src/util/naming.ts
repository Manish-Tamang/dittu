export const slugify = (s: string, max = 40) =>
  s
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, max) || 'file';

/** PascalCase identifier from free text: "hero-section" → "HeroSection". */
export function pascal(s: string, max = 32): string {
  const words = s
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  let out = words
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .slice(0, max);
  if (/^\d/.test(out)) out = 'S' + out;
  return out;
}
