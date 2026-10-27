import { describe, expect, it } from 'vitest';
import { CrawlQueue, crawlScope, parseRobots } from './crawl.js';

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

describe('robots.txt wildcards', () => {
  it('supports * and $ (RFC 9309)', () => {
    const allowed = parseRobots(
      `User-agent: *\nDisallow: /*/copy-task/\nDisallow: */post-task/\nDisallow: /*.pdf$\nAllow: /tasks/ok/\nDisallow: /tasks/\n`,
    );
    expect(allowed('/au/copy-task/1')).toBe(false);
    expect(allowed('/au/x/post-task/')).toBe(false);
    expect(allowed('/files/a.pdf')).toBe(false);
    expect(allowed('/files/a.pdf/view')).toBe(true);
    expect(allowed('/tasks/ok/1')).toBe(true);
    expect(allowed('/tasks/other')).toBe(false);
    expect(allowed('/au/services/')).toBe(true);
  });
});

describe('crawl scope', () => {
  it('stays inside the start folder', () => {
    expect(crawlScope('https://x.com/au/')).toBe('/au/');
    expect(crawlScope('https://x.com/home')).toBe('/');
    expect(crawlScope('https://x.com')).toBe('/');
    const q = new CrawlQueue('https://x.com/au', 'https://x.com', '/au/');
    q.enqueue(['https://x.com/au/cleaning', 'https://x.com/us/cleaning', 'https://x.com/about']);
    expect([q.next(), q.next(), q.next()]).toEqual(['https://x.com/au', 'https://x.com/au/cleaning', undefined]);
  });
});
