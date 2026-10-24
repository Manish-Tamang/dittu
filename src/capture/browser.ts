import { chromium, type Browser, type Page } from 'playwright';
import { MAX_SHOT_HEIGHT } from '../config/defaults.js';
import type { Viewport } from '../domain/snapshot.js';
import { readBridge } from '../util/paths.js';
import { sleep } from '../util/time.js';

export async function launch(): Promise<Browser> {
  // channel "chromium" = full Chrome in new headless mode: renders like the
  // browser people actually use, unlike the stripped headless shell.
  return chromium.launch({ channel: 'chromium', headless: true });
}

export async function newContext(browser: Browser, viewport: Viewport, opts: { record?: boolean } = {}) {
  const probe = await browser.newPage();
  const ua = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await probe.close();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    userAgent: ua,
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  });
  if (opts.record) await context.addInitScript({ content: readBridge('browser/recorder.js') });
  return context;
}

export async function load(page: Page, url: string, waitMs: number) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  } catch (err) {
    // Some sites never fire `load` (long-polling, stuck trackers).
    if (!page.url() || page.url() === 'about:blank') throw err;
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await sleep(waitMs);
}

/** Scroll top → bottom → top so lazy content and scroll-triggered reveals all fire. */
export async function autoScroll(page: Page, maxSteps = 60) {
  const metrics = () =>
    page.evaluate(() => ({
      y: window.scrollY,
      h: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
      vh: window.innerHeight,
    }));
  let m = await metrics();
  for (let i = 0; i < maxSteps && m.y + m.vh < m.h - 2; i++) {
    const step = Math.round(m.vh * 0.7);
    await page.mouse.wheel(0, step);
    await sleep(220);
    const next = await metrics();
    if (next.y <= m.y) {
      // wheel didn't move the window (custom scroller or blocked): force it
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), m.y + step);
      await sleep(120);
    }
    m = await metrics();
  }
  await sleep(500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.mouse.wheel(0, -100_000);
  await sleep(300);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page
    .evaluate(async () => {
      const imgs = [...document.images].filter((i) => !i.complete);
      await Promise.race([
        Promise.all(
          imgs.map(
            (i) =>
              new Promise((r) => {
                i.addEventListener('load', r, { once: true });
                i.addEventListener('error', r, { once: true });
              }),
          ),
        ),
        new Promise((r) => setTimeout(r, 6000)),
      ]);
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
    })
    .catch(() => {});
  await sleep(800);
}

export async function freeze(page: Page) {
  await page.evaluate(readBridge('browser/freeze.js'));
  await sleep(300);
}

/** The same procedure is used for original and clone, so screenshots are comparable. */
export async function stabilize(page: Page) {
  await autoScroll(page);
  await settle(page);
  await freeze(page);
}

export async function fullScreenshot(page: Page, path: string) {
  const h = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
  );
  const vw = page.viewportSize()!.width;
  await page.screenshot({
    path,
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    timeout: 120_000,
    ...(h > MAX_SHOT_HEIGHT ? { clip: { x: 0, y: 0, width: vw, height: MAX_SHOT_HEIGHT } } : {}),
  });
}

export type { Browser, Page, Viewport };
