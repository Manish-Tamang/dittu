import type { BrowserContext, Response } from 'playwright';
import { MAX_ASSET_BYTES } from '../config/defaults.js';

export interface RecordedBody {
  body: Buffer;
  contentType: string;
}

const KEEP = new Set(['image', 'font', 'stylesheet', 'media', 'other', 'fetch', 'xhr']);

/**
 * Keeps response bodies of everything the page loaded, so assets come from
 * the exact session that rendered the snapshot (signed URLs, cookies, A/B
 * variants all line up).
 */
export class NetworkRecorder {
  readonly bodies = new Map<string, RecordedBody>();
  private pending = new Set<Promise<void>>();

  attach(context: BrowserContext) {
    context.on('response', (res) => {
      const p = this.record(res).finally(() => this.pending.delete(p));
      this.pending.add(p);
    });
  }

  private async record(res: Response) {
    const req = res.request();
    const type = req.resourceType();
    if (!KEEP.has(type) || res.status() !== 200) return;
    const contentType = (res.headers()['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (
      (type === 'fetch' || type === 'xhr' || type === 'other') &&
      !/^(image|font|text\/css|video|audio)|svg|woff|octet/.test(contentType)
    )
      return;
    const len = Number(res.headers()['content-length'] || 0);
    if (len > MAX_ASSET_BYTES) return;
    try {
      const body = await res.body();
      if (body.length <= MAX_ASSET_BYTES) this.bodies.set(res.url(), { body, contentType });
    } catch {
      // redirects, aborted requests, evicted bodies: fetched later if needed
    }
  }

  async flush() {
    await Promise.allSettled(this.pending);
  }

  text(url: string): string | undefined {
    return this.bodies.get(url)?.body.toString('utf8');
  }
}
