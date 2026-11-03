import { describe, expect, it } from 'vitest';
import {
  closeWindowSession,
  flushDomain,
  hasAnySession,
  setWindowSession,
  tickAll,
  type SessionMap,
} from './accounting';
import type { ActiveSession } from '../shared/types';

const T0 = 1_790_000_000_000;
const S = (windowId: number, domain: string, sinceMs: number): ActiveSession => ({
  windowId,
  tabId: windowId * 10,
  domain,
  sinceMs,
});
const map = (...ss: ActiveSession[]): SessionMap =>
  Object.fromEntries(ss.map((s) => [String(s.windowId), s]));

describe('setWindowSession', () => {
  it('opens a session on a fresh map and charges nothing on open', () => {
    const r = setWindowSession({}, 1, 'youtube.com', 10, T0);
    expect(r.segment).toBeNull();
    expect(r.next['1']).toEqual(S(1, 'youtube.com', T0));
  });

  it('closing a window flushes its pending segment', () => {
    const open = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    const closed = closeWindowSession(open, 1, T0 + 60_000);
    expect(closed.segment).toEqual({ domain: 'youtube.com', fromMs: T0, toMs: T0 + 60_000 });
    expect(closed.next).toEqual({});
  });

  it('switching a window to a non-blocked tab closes its session', () => {
    const open = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    const r = setWindowSession(open, 1, null, 11, T0 + 30_000);
    expect(r.segment?.domain).toBe('youtube.com');
    expect(r.next).toEqual({});
  });

  it('does not mutate the input map', () => {
    const original = map(S(1, 'youtube.com', T0));
    setWindowSession(original, 2, 'reddit.com', 20, T0 + 1000);
    expect(Object.keys(original)).toEqual(['1']);
    expect(original['1'].sinceMs).toBe(T0);
  });
});

describe('multi-window accrual', () => {
  it('two windows with different domains accrue independently', () => {
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    sessions = setWindowSession(sessions, 2, 'reddit.com', 20, T0).next;
    const t = tickAll(sessions, T0 + 60_000);
    expect(t.segments).toHaveLength(2);
    expect(t.segments.find((s) => s.domain === 'youtube.com')).toEqual({
      domain: 'youtube.com',
      fromMs: T0,
      toMs: T0 + 60_000,
    });
    expect(t.segments.find((s) => s.domain === 'reddit.com')?.toMs).toBe(T0 + 60_000);
  });

  it('an unfocused second-window session keeps accruing (focus is not tracked)', () => {
    // Same transition sequence regardless of which window has keyboard focus:
    // a tick charges every open session at real time.
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    sessions = setWindowSession(sessions, 2, 'example.org', 20, T0 + 5_000).next;
    const t = tickAll(sessions, T0 + 45_000);
    expect(t.segments.map((s) => [s.domain, s.toMs - s.fromMs])).toEqual([
      ['youtube.com', 45_000],
      ['example.org', 40_000],
    ]);
  });

  it('the same domain in two windows charges once, not twice', () => {
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    sessions = setWindowSession(sessions, 2, 'youtube.com', 20, T0 + 10_000).next;
    const t = tickAll(sessions, T0 + 70_000);
    const yt = t.segments.filter((s) => s.domain === 'youtube.com');
    expect(yt).toHaveLength(1);
    // Union = oldest anchor .. now (70s), NOT 70 + 60 = 130s.
    expect(yt[0]).toEqual({ domain: 'youtube.com', fromMs: T0, toMs: T0 + 70_000 });
  });

  it('closing one of two same-domain windows neither double-charges nor drops time', () => {
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    sessions = setWindowSession(sessions, 2, 'youtube.com', 20, T0 + 30_000).next;
    // Window 2 closes at +70s: the pending union (T0..+70s) flushes exactly once.
    const closed = closeWindowSession(sessions, 2, T0 + 70_000);
    expect(closed.segment).toEqual({ domain: 'youtube.com', fromMs: T0, toMs: T0 + 70_000 });
    // Window 1's survivor continues from the flush point...
    const t = tickAll(closed.next, T0 + 100_000);
    expect(t.segments).toEqual([{ domain: 'youtube.com', fromMs: T0 + 70_000, toMs: T0 + 100_000 }]);
    // Total charged == wall clock the domain was visible (T0..+100s).
    const total =
      (closed.segment!.toMs - closed.segment!.fromMs) +
      t.segments.reduce((a, s) => a + (s.toMs - s.fromMs), 0);
    expect(total).toBe(100_000);
  });

  it('a minimized window stops the clock', () => {
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    const dropped = closeWindowSession(sessions, 1, T0 + 20_000); // minimize
    sessions = dropped.next;
    const after = tickAll(sessions, T0 + 120_000); // time passes while minimized
    expect(after.segments).toEqual([]);
    expect(hasAnySession(sessions)).toBe(false);
  });

  it('restoring re-opens a session that accrues from the restore point', () => {
    let sessions = setWindowSession({}, 1, 'youtube.com', 10, T0).next;
    sessions = closeWindowSession(sessions, 1, T0 + 20_000).next; // minimized
    sessions = setWindowSession(sessions, 1, 'youtube.com', 10, T0 + 120_000).next; // restored
    const t = tickAll(sessions, T0 + 150_000);
    // Only the restored span accrues; the minimized span never does.
    expect(t.segments).toEqual([{ domain: 'youtube.com', fromMs: T0 + 120_000, toMs: T0 + 150_000 }]);
  });
});

describe('tickAll / flushDomain', () => {
  it('re-anchors sessions so the next tick only charges new time', () => {
    const sessions = map(S(1, 'youtube.com', T0));
    const t1 = tickAll(sessions, T0 + 60_000);
    const t2 = tickAll(t1.next, T0 + 120_000);
    expect(t1.segments).toHaveLength(1);
    expect(t2.segments).toEqual([{ domain: 'youtube.com', fromMs: T0 + 60_000, toMs: T0 + 120_000 }]);
  });

  it('charging zero time yields no segment', () => {
    const sessions = map(S(1, 'youtube.com', T0));
    expect(tickAll(sessions, T0).segments).toEqual([]);
    expect(flushDomain(sessions, 'youtube.com', T0).segment).toBeNull();
  });

  it('flushing an absent domain is a no-op', () => {
    expect(flushDomain({}, 'youtube.com', T0)).toEqual({ segment: null, next: {} });
  });

  it('hasAnySession tracks map emptiness', () => {
    expect(hasAnySession({})).toBe(false);
    expect(hasAnySession(map(S(1, 'youtube.com', T0)))).toBe(true);
  });
});
