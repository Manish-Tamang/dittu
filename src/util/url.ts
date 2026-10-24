export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

/** Parse a srcset attribute; commas inside URLs (data: URIs, query strings) are kept. */
export function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  let i = 0;
  const s = value;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    let j = i;
    while (j < s.length && !/\s/.test(s[j])) j++;
    let url = s.slice(i, j);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
      i = j;
    } else {
      let k = j;
      while (k < s.length && s[k] !== ',') k++;
      descriptor = s.slice(j, k).trim();
      i = k + 1;
    }
    out.push({ url, descriptor });
  }
  return out;
}

export const formatSrcset = (list: SrcsetCandidate[]) =>
  list.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(', ');

export function resolveUrl(u: string, base: string): string | null {
  try {
    return new URL(u.trim(), base).href;
  } catch {
    return null;
  }
}

/** Canonical page URL for crawling: no hash, no query, no trailing slash. */
export function normalizePageUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    url.search = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return null;
  }
}
