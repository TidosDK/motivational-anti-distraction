/**
 * Single source of truth for the usage day: [usageDayStart, nextReset),
 * with a user-configurable local reset hour (default 05:00) so late-night
 * sessions belong to the day they started on.
 */

export function usageDayStart(now: number, resetHour: number): number {
  const d = new Date(now);
  if (d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  d.setHours(resetHour, 0, 0, 0);
  return d.getTime();
}

export function nextReset(now: number, resetHour: number): number {
  const d = new Date(usageDayStart(now, resetHour));
  d.setDate(d.getDate() + 1);
  d.setHours(resetHour, 0, 0, 0); // DST-safe: re-anchor to the local hour
  return d.getTime();
}

/** Stable local-date key for a usage day, e.g. "2026-10-29". */
export function dayKey(dayStartMs: number): string {
  const d = new Date(dayStartMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
