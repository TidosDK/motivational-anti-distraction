import { describe, expect, it } from 'vitest';
import { closeSession, switchFocus, tickSession, type ActiveSession } from './accounting';

const S = 1000;
const session = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  windowId: 1,
  tabId: 10,
  domain: 'youtube.com',
  sinceMs: 100 * S,
  ...over,
});

describe('closeSession', () => {
  it('returns nothing without a session', () => {
    expect(closeSession(null, 200 * S)).toBeNull();
  });

  it('returns nothing for zero-length sessions', () => {
    expect(closeSession(session(), 100 * S)).toBeNull();
  });

  it('returns the elapsed segment', () => {
    expect(closeSession(session(), 160 * S)).toEqual({
      domain: 'youtube.com',
      fromMs: 100 * S,
      toMs: 160 * S,
    });
  });
});

describe('switchFocus', () => {
  it('accrues the old session and opens the new domain', () => {
    const r = switchFocus(session(), 'instagram.com', 11, 1, 130 * S);
    expect(r.closed).toEqual({ domain: 'youtube.com', fromMs: 100 * S, toMs: 130 * S });
    expect(r.next).toEqual({ windowId: 1, tabId: 11, domain: 'instagram.com', sinceMs: 130 * S });
  });

  it('accrues and ends the session when focus goes to a non-blocked tab', () => {
    const r = switchFocus(session(), null, 12, 1, 130 * S);
    expect(r.closed?.domain).toBe('youtube.com');
    expect(r.next).toBeNull();
  });

  it('opens a session with no previous one', () => {
    const r = switchFocus(null, 'youtube.com', 10, 1, 100 * S);
    expect(r.closed).toBeNull();
    expect(r.next?.domain).toBe('youtube.com');
  });

  it('background tabs never accrue: switching away to a non-blocked tab closes the session, and nothing happens afterwards', () => {
    let active: ActiveSession | null = session();
    const r = switchFocus(active, null, 12, 1, 130 * S);
    active = r.next;
    // 40 further minutes in the background tab
    const r2 = switchFocus(active, null, 12, 1, 130 * S + 40 * 60 * S);
    expect(r2.closed).toBeNull();
  });
});

describe('tickSession', () => {
  it('accrues since the last tick and re-anchors', () => {
    const { accrued, next } = tickSession(session(), 160 * S);
    expect(accrued).toEqual({ domain: 'youtube.com', fromMs: 100 * S, toMs: 160 * S });
    expect(next.sinceMs).toBe(160 * S);
    expect(next.tabId).toBe(10);
  });

  it('handles a tick with no elapsed time', () => {
    const { accrued, next } = tickSession(session(), 100 * S);
    expect(accrued.toMs).toBe(accrued.fromMs);
    expect(next.sinceMs).toBe(100 * S);
  });
});
