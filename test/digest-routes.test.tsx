import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
const app = createApp(config);

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// File order is deliberately not job order: rows come back sorted by job name.
const NORMAL = [
  line('2026-10-29T01:00:00+01:00', 'z/last', 'ok', null),
  line('2026-10-29T01:01:00+01:00', 'm/retried', 'retry', 'ann', 'timeout'),
  line('2026-10-29T01:02:00+01:00', 'm/retried', 'retry', 'ann', 'timeout'),
  line('2026-10-29T01:03:00+01:00', 'm/retried', 'retry', 'ann', 'timeout'),
  line('2026-10-29T01:04:00+01:00', 'm/retried', 'ok', 'ann'),
  line('2026-10-29T01:05:00+01:00', 'f/failed', 'fail', 'bob', 'quota'),
  line('2026-10-29T01:06:00+01:00', 'a/fine', 'ok', 'cy'),
  line('2026-10-29T01:07:00+01:00', 'b/twice', 'retry', 'cy', 'timeout'),
  line('2026-10-29T01:08:00+01:00', 'b/twice', 'retry', 'cy', 'timeout'),
  '',
].join('\n');

const night = (name: string, content: string) => writeFileSync(join(runsDir, `${name}.jsonl`), content);
night('2026-02-01', NORMAL);
night('2026-02-02', '');
night('2026-02-03', `${line('2026-10-29T01:00:00+01:00', 'a/fine', 'ok', 'cy')}\n{"at":"2026-10-29T01:01:00+01:00","job":"a/f\n`);

const JOBS = ['a/fine', 'b/twice', 'f/failed', 'm/retried', 'z/last'];

describe('GET /digest/:night', () => {
  it('renders rows in job order, dashes null owners and warns on retries or fails', async () => {
    const res = await app.request('/digest/2026-02-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const positions = JOBS.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const rows = html.split('<tr').filter((r) => r.includes('<td>'));
    const rowOf = (job: string) => rows.find((r) => r.includes(`<td>${job}</td>`)) ?? '';
    expect(rowOf('m/retried')).toContain('class="warn"');
    expect(rowOf('f/failed')).toContain('class="warn"');
    expect(rowOf('a/fine')).not.toContain('warn');
    // Two retries is under the plan's mark of 3.
    expect(rowOf('b/twice')).not.toContain('warn');
    expect(rowOf('z/last')).not.toContain('warn');
    expect(rowOf('z/last')).toContain('<td>—</td>');
  });

  it('404s for a night with no file and for a name that is not a date', async () => {
    expect((await app.request('/digest/2026-02-09')).status).toBe(404);
    expect((await app.request('/digest/abc')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders with a bad line and reports it', async () => {
    const res = await app.request('/digest/2026-02-03');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('1 line in the log could not be read');
  });
});

describe('page and JSON for 2026-10-28', () => {
  it('list the same jobs in the same order (ADR 0001)', async () => {
    const real = createApp({ ...config, runsDir: 'runs' });
    const html = await (await real.request('/digest/2026-10-28')).text();
    const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    const body = (await (await real.request('/api/digest/2026-10-28')).json()) as Night;
    expect(pageJobs).toHaveLength(5);
    expect(pageJobs).toEqual(body.rows.map((r) => r.job));
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the same jobs in the same order as the page', async () => {
    const res = await app.request('/api/digest/2026-02-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
    expect(body.rows.find((r) => r.job === 'z/last')?.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'm/retried')).toMatchObject({ retries: 3, fails: 0 });
    expect(body.rows.find((r) => r.job === 'f/failed')).toMatchObject({ fails: 1 });
  });

  it('404s for a night with no file and for a name that is not a date', async () => {
    expect((await app.request('/api/digest/2026-02-09')).status).toBe(404);
    expect((await app.request('/api/digest/abc')).status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rows: [], badLines: 0 });
  });

  it('counts a bad line and still answers 200', async () => {
    const res = await app.request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ badLines: 1 });
  });
});
