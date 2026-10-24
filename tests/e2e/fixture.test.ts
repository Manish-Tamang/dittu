// End-to-end: clone the hard-cases fixture and require near-perfect fidelity.
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloneAndVerify } from '../../src/pipeline/run.js';
import { runDoctor } from '../../src/pipeline/doctor.js';
import { setLogSink } from '../../src/util/log.js';
import { serveStatic } from '../../src/verify/staticServer.js';

const fixture = fileURLToPath(new URL('../fixtures/hard', import.meta.url));
const chromiumOk = (await runDoctor()).find((c) => c.name === 'Chromium launches')?.ok ?? false;

describe.skipIf(!chromiumOk)('fixture clone', () => {
  let url = '';
  let server: Server | undefined;
  beforeAll(async () => {
    setLogSink('silent');
    ({ url, server } = await serveStatic([['/', fixture]]));
  });
  afterAll(() => server?.close());

  it('clones 2 pages with ≥ 99% visual match at desktop and mobile', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'dittu-e2e-'));
    const { clone, report } = await cloneAndVerify({
      url: url + '/',
      outDir,
      frameworks: [],
      pages: 2,
      viewport: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
      breakpoint: 768,
      remove: [],
      waitMs: 300,
      split: true,
      format: false,
      verify: true,
      build: false,
      widths: [1440, 390],
    });
    expect(clone.manifest.pages.map((p) => p.route)).toEqual(['/', '/about']);
    // every recorded reveal survived (2 class toggles, 1 WAAPI, 1 bottom section)
    expect(clone.site.pages[0].motion.filter((m) => m.type !== 'resp')).toHaveLength(4);
    expect(report!.results).toHaveLength(4);
    for (const r of report!.results) expect(r.diff.score, `${r.route} @${r.width}`).toBeGreaterThan(0.99);
  }, 240_000);
});
