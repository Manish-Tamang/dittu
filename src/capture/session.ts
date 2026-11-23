import type { Browser, BrowserContext } from 'playwright';
import type { Viewport } from '../domain/snapshot.js';
import { launch, newContext } from './browser.js';

/**
 * The browser and contexts a clone captures with. Long crawls can crash
 * Chromium (out of memory, renderer crash); `recover()` relaunches it so the
 * remaining pages, and the asset downloads after capture, still work.
 */
export class CaptureSession {
  private browser!: Browser;
  context!: BrowserContext;
  mobileContext?: BrowserContext;

  private constructor(
    private readonly viewport: Viewport,
    private readonly mobile: Viewport | null,
    /** Called for every new context (network recording). */
    private readonly onContext: (context: BrowserContext) => void,
  ) {}

  static async open(viewport: Viewport, mobile: Viewport | null, onContext: (context: BrowserContext) => void) {
    const session = new CaptureSession(viewport, mobile, onContext);
    await session.start();
    return session;
  }

  private async start() {
    this.browser = await launch();
    this.context = await newContext(this.browser, this.viewport, { record: true });
    this.onContext(this.context);
    this.mobileContext = this.mobile ? await newContext(this.browser, this.mobile) : undefined;
    if (this.mobileContext) this.onContext(this.mobileContext);
  }

  /** False once the browser or a context has died. */
  async healthy(): Promise<boolean> {
    if (!this.browser.isConnected()) return false;
    try {
      for (const ctx of [this.context, this.mobileContext]) await (await ctx?.newPage())?.close();
      return true;
    } catch {
      return false;
    }
  }

  /** Relaunch the browser if it died. Returns true when it was relaunched. */
  async recover(): Promise<boolean> {
    if (await this.healthy()) return false;
    await this.close();
    await this.start();
    return true;
  }

  async close() {
    // Closing the browser closes its contexts; a crashed one may throw.
    await this.browser.close().catch(() => {});
  }
}
