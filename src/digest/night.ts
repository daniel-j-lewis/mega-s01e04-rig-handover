// A night is a calendar date as written in the run log's file name: `YYYY-MM-DD`.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function isNight(s: string): boolean {
  return NIGHT.test(s);
}
