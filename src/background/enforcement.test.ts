import { describe, expect, it } from 'vitest';
import { computeBlockedDomains, diffRules, regexFilterFor } from './enforcement';
import type { DayState, Settings } from '../shared/types';

const MIN = 60;
const settings: Settings = {
  version: 1,
  sites: [
    { domain: 'youtube.com', limitMin: 1, passes: 1 },
    { domain: 'instagram.com', limitMin: 30, passes: 1 },
  ],
  combinedBudgetMin: 120,
  resetHour: 5,
};
const state = (over: Partial<DayState> = {}): DayState => ({
  version: 1,
  dayStart: 0,
  perSiteSeconds: {},
  passesActive: {},
  passesUsed: {},
  ...over,
});

describe('computeBlockedDomains', () => {
  it('nothing blocked when meters have room', () => {
    expect(computeBlockedDomains(settings, state())).toEqual([]);
  });

  it('blocked domains appear sorted once exhausted', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 61, 'instagram.com': 31 * MIN },
    });
    expect(computeBlockedDomains(settings, s)).toEqual(['instagram.com', 'youtube.com']);
  });

  it('a spent day-pass removes only its own site from the rule set', () => {
    const s = state({
      perSiteSeconds: { 'youtube.com': 61, 'instagram.com': 31 * MIN },
      passesActive: { 'youtube.com': true },
    });
    expect(computeBlockedDomains(settings, s)).toEqual(['instagram.com']);
  });
});

describe('regexFilterFor', () => {
  it.each([
    'https://youtube.com/watch',
    'http://youtube.com',
    'https://www.youtube.com/',
    'https://m.music.youtube.com/x?a=1',
    'https://youtube.com:8443',
  ])('matches %s', (url) => {
    const re = new RegExp(regexFilterFor('youtube.com'));
    expect(re.test(url)).toBe(true);
  });

  it.each([
    'https://notyoutube.com',
    'https://youtube.com.evil.com',
    'https://youtube.co',
    'https://you tube.com',
    'https://youtube.comx/path',
  ])('does not match %s', (url) => {
    const re = new RegExp(regexFilterFor('youtube.com'));
    expect(re.test(url)).toBe(false);
  });
});

describe('diffRules', () => {
  it('adds rules that do not exist yet', () => {
    const d = [{ id: 1, domain: 'a.com', redirectUrl: 'ext://i?a' }];
    expect(diffRules(d, [])).toEqual({ add: d, removeIds: [] });
  });

  it('removes rules that are no longer desired', () => {
    const e = [{ id: 1, redirectUrl: 'ext://i?a' }];
    expect(diffRules([], e)).toEqual({ add: [], removeIds: [1] });
  });

  it('replaces a rule whose redirect changed', () => {
    const desired = [{ id: 1, domain: 'a.com', redirectUrl: 'ext://i?a=v2' }];
    const existing = [{ id: 1, redirectUrl: 'ext://i?a=v1' }];
    expect(diffRules(desired, existing)).toEqual({ add: desired, removeIds: [1] });
  });

  it('leaves identical rules untouched', () => {
    const same = { id: 1, domain: 'a.com', redirectUrl: 'ext://i?a' };
    expect(diffRules([same], [{ id: 1, redirectUrl: 'ext://i?a' }])).toEqual({ add: [], removeIds: [] });
  });
});
