// End-to-end: a crashed browser is relaunched so a crawl can keep going.
import { describe, expect, it } from 'vitest';
import { CaptureSession } from '../../src/capture/session.js';
import { runDoctor } from '../../src/pipeline/doctor.js';

const chromiumOk = (await runDoctor()).find((c) => c.name === 'Chromium launches')?.ok ?? false;

describe.skipIf(!chromiumOk)('capture session', () => {
  it('relaunches the browser after it dies', async () => {
    let contexts = 0;
    const session = await CaptureSession.open(
      { width: 800, height: 600 },
      { width: 390, height: 844 },
      () => contexts++,
    );
    try {
      expect(contexts).toBe(2);
      expect(await session.recover()).toBe(false);

      await session.context.browser()!.close(); // simulate a crash
      await expect(session.context.newPage()).rejects.toThrow(/closed/);

      expect(await session.recover()).toBe(true);
      expect(contexts).toBe(4); // new contexts are recorded again
      const page = await session.context.newPage();
      expect(await page.evaluate(() => 1 + 1)).toBe(2);
      await page.close();
    } finally {
      await session.close();
    }
  });
});
