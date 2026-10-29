// Plan morning-digest § 1. The contract every part of § 2 builds against: one row per job in
// the night's run log (`runs/<night>.jsonl`).

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  // Every log line for the job, and the ones with status `retry`.
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // The most recent `error` seen for the job, even if a later run was ok.
  lastError: string | null;
  // As written in the log, offset kept (styleguide: never convert to UTC).
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse or lacked a field; counted, never thrown.
  badLines: number;
};

// `null` when the night has no file; an empty file gives no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
