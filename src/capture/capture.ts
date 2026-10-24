import type { BrowserContext } from 'playwright';
import { autoScroll, freeze, fullScreenshot, load, settle } from './browser.js';
import type { CaptureResult, ResponsiveItem, Snapshot } from '../domain/snapshot.js';
import { bridgeCall } from '../util/paths.js';

export interface CaptureOptions {
  waitMs: number;
  remove: string[];
  referencePath: string;
  /** Second render at mobile width, to catch layout that JS computes per viewport. */
  mobileContext?: BrowserContext;
}

export async function capturePage(context: BrowserContext, url: string, opts: CaptureOptions): Promise<CaptureResult> {
  const page = await context.newPage();
  const mobilePage = opts.mobileContext ? await opts.mobileContext.newPage() : null;
  try {
    let mobile: Record<string, [string, string, string, string]> | null = null;
    if (mobilePage) {
      try {
        await load(mobilePage, url, opts.waitMs);
        await autoScroll(mobilePage);
        await settle(mobilePage);
        await freeze(mobilePage);
        mobile = await mobilePage.evaluate(bridgeCall('browser/fingerprint.js'));
      } catch {
        mobile = null;
      }
    }
    await load(page, url, opts.waitMs);
    await autoScroll(page);
    await settle(page);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
    );
    await freeze(page);
    await fullScreenshot(page, opts.referencePath);

    const snapshot = (await page.evaluate(
      bridgeCall('browser/snapshot.js', { remove: opts.remove, mobile }),
    )) as Snapshot;
    const pending = snapshot.responsive.filter((r) => !r.values);
    if (mobilePage && pending.length) {
      const values = (await mobilePage.evaluate(
        bridgeCall(
          'browser/computed.js',
          pending.map(({ path, props }) => ({ path, props })),
        ),
      )) as (Record<string, string> | null)[];
      pending.forEach((r, i) => (r.values = values[i]));
    }

    dedupeResponsive(snapshot);

    const canvasShots = new Map<string, Buffer>();
    for (const c of snapshot.canvases) {
      try {
        // Clip at the canvas's exact (rounded) box: element screenshots round
        // fractional positions outward and come out a pixel too large.
        const clip = {
          x: Math.round(c.x),
          y: Math.round(c.y),
          width: Math.max(1, Math.round(c.width)),
          height: Math.max(1, Math.round(c.height)),
        };
        canvasShots.set(
          c.cid,
          await page.screenshot({ fullPage: true, clip, animations: 'disabled', timeout: 30_000 }),
        );
      } catch {
        snapshot.warnings.push(`Could not capture canvas #${c.cid}.`);
      }
    }
    return { snapshot, canvasShots, links };
  } finally {
    await page.close();
    await mobilePage?.close();
  }
}

/**
 * Elements with identical mobile overrides share one id, so repeated elements
 * keep identical markup (and can become one component).
 */
function dedupeResponsive(snapshot: Snapshot) {
  const byKey = new Map<string, ResponsiveItem>();
  const remap = new Map<string, string>();
  for (const r of snapshot.responsive) {
    const key = JSON.stringify([r.props, r.values, r.add, r.remove]);
    let shared = byKey.get(key);
    if (!shared) {
      shared = { ...r, id: 'r' + (byKey.size + 1) };
      byKey.set(key, shared);
    }
    remap.set(r.id, shared.id);
  }
  snapshot.bodyHtml = snapshot.bodyHtml.replace(/data-dittu-r="(\d+)"/g, (m, id) =>
    remap.has(id) ? `data-dittu-r="${remap.get(id)}"` : m,
  );
  snapshot.responsive = [...byKey.values()];
}
