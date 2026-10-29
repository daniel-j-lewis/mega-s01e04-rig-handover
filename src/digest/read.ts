import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const isStatus = (s: unknown): s is RunStatus => s === 'ok' || s === 'retry' || s === 'fail';
const isText = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';

// Parse at the edge (styleguide): anything that isn't a whole line is a bad line, never thrown.
function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isText(o.at) || !isText(o.job) || !isStatus(o.status)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  // An empty owner is missing data, like `null` (shown as `—`).
  const owner = isText(o.owner) ? o.owner : null;
  return { at: o.at, job: o.job, status: o.status, owner, error: o.error ?? null };
}

// The whole file, or `null` when the night has no readable file (gone, a directory, no access).
function readFile(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  const content = readFile(join(runsDir, `${night}.jsonl`));
  if (content === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const text of content.split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (!line) {
      badLines++;
      continue;
    }
    const row = rows.get(line.job);
    if (!row) {
      rows.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        fails: line.status === 'fail' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    // Lines are in time order, so the later line wins for owner, status and last time.
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (line.status === 'fail') row.fails++;
    row.lastStatus = line.status;
    row.lastError = line.error ?? row.lastError;
    row.lastAt = line.at;
  }

  const sorted = [...rows.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows: sorted, badLines } satisfies Night;
};
