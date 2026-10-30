import { describe, expect, it } from 'vitest';
import { dayKey, nextReset, usageDayStart } from './dayMath';

/** Local-time timestamp helper. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute, 0, 0).getTime(); // October 2026

describe('usageDayStart', () => {
  it('attributes night-owl hours (before the reset hour) to the previous day', () => {
    // 01:30 on Oct 15 with a 05:00 reset belongs to the day that started Oct 14 05:00
    expect(usageDayStart(at(15, 1, 30), 5)).toBe(at(14, 5));
  });

  it('attributes hours after the reset hour to the current day', () => {
    expect(usageDayStart(at(15, 6), 5)).toBe(at(15, 5));
  });

  it('treats the exact reset hour as the start of the new day', () => {
    expect(usageDayStart(at(15, 5, 0), 5)).toBe(at(15, 5));
  });

  it('treats one minute before the reset hour as still the old day', () => {
    expect(usageDayStart(at(15, 4, 59), 5)).toBe(at(14, 5));
  });

  it('handles a midnight reset', () => {
    expect(usageDayStart(at(15, 0, 0), 0)).toBe(at(15, 0));
    expect(usageDayStart(at(15, 23, 59), 0)).toBe(at(15, 0));
  });

  it('handles a 22:00 reset', () => {
    expect(usageDayStart(at(15, 23), 22)).toBe(at(15, 22));
    expect(usageDayStart(at(15, 21), 22)).toBe(at(14, 22));
  });
});

describe('nextReset', () => {
  it('is the upcoming reset boundary', () => {
    expect(nextReset(at(14, 23), 5)).toBe(at(15, 5));
    expect(nextReset(at(15, 5, 1), 5)).toBe(at(16, 5));
  });

  it('is exactly one day after the day start', () => {
    const start = usageDayStart(at(15, 1, 30), 5);
    expect(nextReset(at(15, 1, 30), 5)).toBe(start + 24 * 60 * 60 * 1000);
  });
});

describe('dayKey', () => {
  it('formats the local date of the day start', () => {
    expect(dayKey(at(5, 5))).toBe('2026-10-05');
    expect(dayKey(at(15, 5))).toBe('2026-10-15');
  });
});
