import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps retries, the last error, null owners and the log offset', () => {
    const rows = readNight('runs', '2026-10-28')?.rows ?? [];
    const byJob = Object.fromEntries(rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['notes/backup']).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob['digest/render']?.owner).toBeNull();
  });

  it('returns null for a night with no file and no rows for an empty one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toBeNull();
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines with a missing field or unknown status as bad', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      ['{"at":"t","job":"a","status":"ok","owner":"x"}', '{"at":"t","job":"a","status":"maybe","owner":"x"}', '{"job":"b"}', '[]', ''].join('\n'),
    );
    expect(readNight(dir, '2026-01-01')).toMatchObject({ badLines: 3, rows: [{ job: 'a', runs: 1 }] });
  });
});
