import { describe, expect, it } from 'vitest';
import { CrawlQueue, parseRobots } from './crawl.js';

describe('robots.txt', () => {
  it('applies the * group with longest-match precedence', () => {
    const allowed = parseRobots(
      `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\n`,
    );
    expect(allowed('/')).toBe(true);
    expect(allowed('/admin/users')).toBe(false);
    expect(allowed('/admin/public/page')).toBe(true);
  });
});

describe('crawl queue', () => {
  it('keeps same-origin pages once and skips files', () => {
    const q = new CrawlQueue('https://x.com/', 'https://x.com');
    q.enqueue([
      'https://x.com/about',
      'https://x.com/about/#team',
      'https://y.com/',
      'https://x.com/logo.png',
      'https://x.com/',
    ]);
    expect([q.next(), q.next(), q.next()]).toEqual(['https://x.com/', 'https://x.com/about', undefined]);
  });
});
