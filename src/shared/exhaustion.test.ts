import { describe, expect, it } from 'vitest';
import {
  applyPassSpend,
  combinedTotalSeconds,
  isPassActive,
  isSiteExhausted,
  passExpiryTime,
} from './exhaustion';
import { nextReset } from './dayMath';
import type { DayState, Settings } from './types';

const MIN = 60;
const NOW = new Date(2026, 9, 30, 20, 0, 0).getTime(); // 20:00 local

const settings = (over: Partial<Settings> = {}): Settings => ({
  version: 1,
  sites: [
    { domain: 'youtube.com', limitMin: 60, passes: 1 },
    { domain: 'instagram.com', limitMin: 30, passes: 1 },
    { domain: 'facebook.com', limitMin: null, passes: 1 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
  passSessionMin: 10,
  ...over,
});

const state = (over: Partial<DayState> = {}): DayState => ({
  version: 1,
  dayStart: 0,
  perSiteSeconds: {},
  passesUntil: {},
  passesUsed: {},
  ...over,
});

describe('isSiteExhausted', () => {
  it('fresh state exhausts nothing', () => {
    expect(isSiteExhausted('youtube.com', state(), settings(), NOW)).toBe(false);
  });

  it('site limit reached exhausts only that site', () => {
    const s = state({ perSiteSeconds: { 'instagram.com': 30 * MIN } });
    expect(isSiteExhausted('instagram.com', s, settings(), NOW)).toBe(true);
    expect(isSiteExhausted('youtube.com', s, settings(), NOW)).toBe(false);
  });

  it('combined budget reached exhausts every site, even sites below their own limit', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 50 * MIN, 'instagram.com': 40 * MIN, 'facebook.com': 30 * MIN },
    });
    expect(combinedTotalSeconds(s)).toBe(120 * MIN);
    expect(isSiteExhausted('youtube.com', s, settings(), NOW)).toBe(true);
  });

  it('overlapping usage counts once toward the combined total', () => {
    const s = state({ perSiteSeconds: { 'youtube.com': 40 * MIN } });
    expect(combinedTotalSeconds(s)).toBe(40 * MIN);
  });

  it('a site without an explicit limit is governed only by the combined budget', () => {
    const s = state({ perSiteSeconds: { 'facebook.com': 119 * MIN } });
    expect(isSiteExhausted('facebook.com', s, settings(), NOW)).toBe(false);
    s.perSiteSeconds['facebook.com'] = 120 * MIN;
    expect(isSiteExhausted('facebook.com', s, settings(), NOW)).toBe(true);
  });

  it('an unexpired day-pass session unblocks its site despite exhausted meters', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 130 * MIN },
      passesUntil: { 'youtube.com': NOW + 5 * MIN },
    });
    expect(isSiteExhausted('youtube.com', s, settings(), NOW)).toBe(false);
    expect(isSiteExhausted('instagram.com', s, settings(), NOW)).toBe(true); // others stay blocked
  });

  it('an EXPIRED session no longer exempts: the site is exhausted again', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 130 * MIN },
      passesUntil: { 'youtube.com': NOW - 1 }, // lapsed one second ago
    });
    expect(isSiteExhausted('youtube.com', s, settings(), NOW)).toBe(true);
    expect(isSiteExhausted('youtube.com', s, settings(), NOW - 2 * MIN)).toBe(false); // was active then
  });

  it('unknown domains are never blocked', () => {
    const s = state({ perSiteSeconds: { 'example.com': 999 * MIN } });
    expect(isSiteExhausted('example.com', s, settings(), NOW)).toBe(false);
  });
});

describe('isPassActive', () => {
  it('absent pass is not active', () => {
    expect(isPassActive(state(), 'youtube.com', NOW)).toBe(false);
  });
  it('future expiry is active', () => {
    const s = state({ passesUntil: { 'youtube.com': NOW + 1000 } });
    expect(isPassActive(s, 'youtube.com', NOW)).toBe(true);
  });
  it('elapsed or exact-expiry timestamps are not active', () => {
    const s = state({ passesUntil: { 'youtube.com': NOW - 1 } });
    expect(isPassActive(s, 'youtube.com', NOW)).toBe(false);
    expect(isPassActive({ ...s, passesUntil: { 'youtube.com': NOW } }, 'youtube.com', NOW)).toBe(false);
  });
});

describe('passExpiryTime', () => {
  it('ends passSessionMin after the spend', () => {
    expect(passExpiryTime(NOW, settings())).toBe(NOW + 10 * MIN * 1000);
  });

  it('is capped at the daily reset', () => {
    const s = settings({ passSessionMin: 600 }); // 10 hours
    const lateNight = new Date(2026, 9, 30, 23, 55, 0).getTime();
    expect(passExpiryTime(lateNight, s)).toBe(nextReset(lateNight, 5));
  });
});

describe('applyPassSpend', () => {
  const exhausted = state({ perSiteSeconds: { 'youtube.com': 130 * MIN } });

  it('spends a pass: sets timed session and counts the use', () => {
    const r = applyPassSpend(exhausted, settings(), 'youtube.com', NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reused).toBe(false);
    expect(r.state.passesUntil['youtube.com']).toBe(NOW + 10 * MIN * 1000);
    expect(r.state.passesUsed['youtube.com']).toBe(1);
    // Input state is not mutated.
    expect(exhausted.passesUntil).toEqual({});
    expect(exhausted.passesUsed).toEqual({});
  });

  it('rejects when all passes are used', () => {
    const used = state({ ...exhausted, passesUsed: { 'youtube.com': 1 } });
    expect(applyPassSpend(used, settings(), 'youtube.com', NOW)).toEqual({
      ok: false,
      reason: 'no-passes-left',
    });
  });

  it('does not double-spend while a session is still active', () => {
    const first = applyPassSpend(exhausted, settings(), 'youtube.com', NOW);
    if (!first.ok) throw new Error('expected spend to succeed');
    const second = applyPassSpend(first.state, settings(), 'youtube.com', NOW + MIN * 1000);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.state.passesUsed['youtube.com']).toBe(1); // still one
    expect(second.state.passesUntil['youtube.com']).toBe(first.expiresAt); // same session
  });

  it('after expiry, a second pass CAN be spent on a site with passes left', () => {
    const twoPass = settings({
      sites: [{ domain: 'youtube.com', limitMin: 60, passes: 2 }],
    });
    const first = applyPassSpend(exhausted, twoPass, 'youtube.com', NOW);
    if (!first.ok) throw new Error('expected spend to succeed');
    const after = applyPassSpend(first.state, twoPass, 'youtube.com', NOW + 11 * MIN * 1000);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.reused).toBe(false);
    expect(after.state.passesUsed['youtube.com']).toBe(2);
  });
});
