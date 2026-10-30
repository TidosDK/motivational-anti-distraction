import { describe, expect, it } from 'vitest';
import { combinedTotalSeconds, isSiteExhausted } from './exhaustion';
import type { DayState, Settings } from './types';

const MIN = 60;

const settings = (over: Partial<Settings> = {}): Settings => ({
  version: 1,
  sites: [
    { domain: 'youtube.com', limitMin: 60, passes: 1 },
    { domain: 'instagram.com', limitMin: 30, passes: 1 },
    { domain: 'facebook.com', limitMin: null, passes: 1 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
  ...over,
});

const state = (over: Partial<DayState> = {}): DayState => ({
  version: 1,
  dayStart: 0,
  perSiteSeconds: {},
  passesActive: {},
  passesUsed: {},
  ...over,
});

describe('isSiteExhausted', () => {
  it('fresh state exhausts nothing', () => {
    expect(isSiteExhausted('youtube.com', state(), settings())).toBe(false);
  });

  it('site limit reached exhausts only that site', () => {
    const s = state({ perSiteSeconds: { 'instagram.com': 30 * MIN } });
    expect(isSiteExhausted('instagram.com', s, settings())).toBe(true);
    expect(isSiteExhausted('youtube.com', s, settings())).toBe(false);
  });

  it('combined budget reached exhausts every site, even sites below their own limit', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 50 * MIN, 'instagram.com': 40 * MIN, 'facebook.com': 30 * MIN },
    });
    expect(combinedTotalSeconds(s)).toBe(120 * MIN);
    expect(isSiteExhausted('youtube.com', s, settings())).toBe(true);
  });

  it('overlapping usage counts once toward the combined total', () => {
    const s = state({ perSiteSeconds: { 'youtube.com': 40 * MIN } });
    expect(combinedTotalSeconds(s)).toBe(40 * MIN);
  });

  it('a site without an explicit limit is governed only by the combined budget', () => {
    const s = state({ perSiteSeconds: { 'facebook.com': 119 * MIN } });
    expect(isSiteExhausted('facebook.com', s, settings())).toBe(false);
    s.perSiteSeconds['facebook.com'] = 120 * MIN;
    expect(isSiteExhausted('facebook.com', s, settings())).toBe(true);
  });

  it('an active day-pass unblocks its site despite exhausted meters', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 130 * MIN },
      passesActive: { 'youtube.com': true },
    });
    expect(isSiteExhausted('youtube.com', s, settings())).toBe(false);
    expect(isSiteExhausted('instagram.com', s, settings())).toBe(true); // others stay blocked
  });

  it('unknown domains are never blocked', () => {
    const s = state({ perSiteSeconds: { 'example.com': 999 * MIN } });
    expect(isSiteExhausted('example.com', s, settings())).toBe(false);
  });
});
