import pc from 'picocolors';
import { DEFAULTS } from '../config/defaults.js';
import type { VerifyReport } from '../domain/report.js';
import type { Check } from '../pipeline/doctor.js';
import type { SetupResult } from '../setup/setup.js';
import { log } from '../util/log.js';

const pct = (score: number) => (score * 100).toFixed(2) + '%';
const colorFor = (score: number) => (score >= DEFAULTS.passScore ? pc.green : score >= 0.85 ? pc.yellow : pc.red);

export function printReport(report: VerifyReport) {
  if (!report.results.length) {
    for (const e of report.errors) log.error(e);
    return;
  }
  log.raw('');
  log.raw(pc.bold('Visual match (1 − differing pixels / total)'));
  for (const r of report.results) {
    const bands = r.diff.worstBands.length
      ? pc.dim(
          ` worst: ${r.diff.worstBands
            .slice(0, 3)
            .map((b) => `y${b.y} ${(b.score * 100).toFixed(0)}%`)
            .join(', ')}`,
        )
      : '';
    log.raw(
      `  ${r.target.padEnd(8)} ${r.route.padEnd(24)} ${String(r.width).padStart(5)}px  ${colorFor(r.diff.score)(pct(r.diff.score).padStart(7))}${bands}`,
    );
  }
  const min = Math.min(...report.results.map((r) => r.diff.score));
  log.raw('');
  if (report.errors.length)
    log.error(`${report.errors.length} target(s) failed to build — scores above cover the rest.`);
  else if (min >= DEFAULTS.passScore) log.ok(`All checks ≥ ${DEFAULTS.passScore * 100}% (lowest ${pct(min)})`);
  else log.warn(`Lowest score ${pct(min)} — open the *.diff.png files in report/ to see where.`);
  for (const e of report.errors) log.error(e);
}

export function printDoctor(checks: Check[]) {
  for (const c of checks) {
    if (c.ok) log.ok(`${c.name.padEnd(22)} ${pc.dim(c.detail)}`);
    else {
      log.error(`${c.name.padEnd(22)} ${c.detail}`);
      if (c.fix) log.raw(`  ${pc.dim('fix:')} ${c.fix}`);
    }
  }
}

export function printSetup(results: SetupResult[], dryRun: boolean) {
  if (!results.length) {
    log.warn('No supported agents detected (Claude Code, Cursor, Gemini CLI, Codex). Use --agents to pick explicitly.');
    return;
  }
  for (const r of results) {
    if (r.error) log.error(`${r.agent.name}: ${r.error}`);
    else {
      log.ok(`${r.agent.name}${dryRun ? pc.dim(' (dry run)') : ''}`);
      for (const a of r.actions) log.info(a);
    }
  }
}
