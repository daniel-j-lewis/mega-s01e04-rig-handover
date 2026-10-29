import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightCounts = { night: string; ok: number; retry: number; fail: number };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightCounts[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Counts are log lines by status; bad lines are in none of them. A night that vanished
// between the listing and the read counts as zeros.
function countNight(runsDir: string, night: string): NightCounts {
  const rows = readNight(runsDir, night)?.rows ?? [];
  const retry = rows.reduce((n, r) => n + r.retries, 0);
  const fail = rows.reduce((n, r) => n + r.fails, 0);
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  return { night, ok: runs - retry - fail, retry, fail };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => countNight(config.runsDir, n)),
  };
}
