import type { APIRequestContext } from 'playwright';
import { normalizePageUrl } from '../util/url.js';

const SKIP_EXT = /\.(pdf|zip|rar|7z|gz|dmg|exe|png|jpe?g|gif|webp|avif|svg|mp4|webm|mp3|xml|rss|json|txt|ico|css|js)$/i;

export type RobotsCheck = (path: string) => boolean;

/** robots.txt rules for `User-agent: *` (RFC 9309: `*` wildcards, `$` end anchor, longest match wins, ties allow). */
export async function loadRobots(request: APIRequestContext, origin: string): Promise<RobotsCheck> {
  try {
    const res = await request.get(new URL('/robots.txt', origin).href, { timeout: 10_000, failOnStatusCode: false });
    if (!res.ok()) return () => true;
    return parseRobots(await res.text());
  } catch {
    return () => true;
  }
}

export function parseRobots(text: string): RobotsCheck {
  const rules: { allow: boolean; length: number; re: RegExp }[] = [];
  let applies = false;
  let lastWasAgent = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      if (!lastWasAgent) applies = false;
      applies ||= m[2] === '*';
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (applies && (key === 'allow' || key === 'disallow') && m[2]) {
      const pattern = m[2];
      const anchored = pattern.endsWith('$');
      const body = (anchored ? pattern.slice(0, -1) : pattern)
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      rules.push({ allow: key === 'allow', length: pattern.length, re: new RegExp(`^${body}${anchored ? '$' : ''}`) });
    }
  }
  return (path) => {
    let best: { allow: boolean; length: number } | null = null;
    for (const r of rules) {
      if (!r.re.test(path)) continue;
      if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
    }
    return !best || best.allow;
  };
}

/**
 * Folder a crawl stays in (like `wget --no-parent`): `/au/` → `/au/`,
 * `/au/home` → `/au/`, `/` → whole site.
 */
export function crawlScope(url: string): string {
  const path = new URL(url).pathname;
  return path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
}

/** Breadth-first queue of same-origin pages inside the start URL's folder. */
export class CrawlQueue {
  private queue: string[] = [];
  private seen = new Set<string>();
  allowed: RobotsCheck = () => true;

  constructor(
    start: string,
    public origin: string,
    private scope = '/',
  ) {
    this.queue.push(start);
    this.seen.add(start);
  }

  next(): string | undefined {
    return this.queue.shift();
  }

  markSeen(url: string) {
    this.seen.add(url);
  }

  enqueue(links: string[]) {
    for (const link of links) {
      const n = normalizePageUrl(link);
      if (!n || this.seen.has(n)) continue;
      const u = new URL(n);
      if (u.origin !== this.origin || !(u.pathname + '/').startsWith(this.scope)) continue;
      if (SKIP_EXT.test(u.pathname) || !this.allowed(u.pathname)) continue;
      this.seen.add(n);
      this.queue.push(n);
    }
  }
}
