/**
 * Foreground session accounting across multiple windows (design D3, revised
 * for multi-monitor use). "Foreground" means "active tab of any *visible*
 * window": the worker keeps one session per window in a map, so a blocked
 * site on a second monitor keeps accruing while the user works elsewhere.
 * All transitions are pure so they can be unit-tested without chrome APIs.
 *
 * Same-domain union invariant: usage must charge once per wall-clock second
 * even when several windows show the same domain. Every mutation first
 * flushes the pending union `[oldest anchor .. now]` for the affected domain
 * and re-anchors all of that domain's sessions to `now`. Live sessions of one
 * domain therefore always share an anchor, so opening, closing, or switching
 * a window can neither double-charge nor drop time.
 */

import type { ActiveSession, SessionMap } from '../shared/types';

export type { ActiveSession, SessionMap };

/** A wall-clock segment to charge to a domain. */
export interface Segment {
  domain: string;
  fromMs: number;
  toMs: number;
}

/** True while at least one window has a counted session. */
export function hasAnySession(sessions: SessionMap): boolean {
  return Object.keys(sessions).length > 0;
}

/**
 * Charge `domain`'s pending union time (oldest anchor -> now, at most once)
 * and re-anchor every session of that domain to `now`. Returns a null segment
 * when no window currently shows the domain.
 */
export function flushDomain(
  sessions: SessionMap,
  domain: string,
  nowMs: number,
): { segment: Segment | null; next: SessionMap } {
  const keys = Object.keys(sessions).filter((w) => sessions[w].domain === domain);
  if (keys.length === 0) return { segment: null, next: sessions };
  const fromMs = Math.min(...keys.map((w) => sessions[w].sinceMs));
  const next: SessionMap = { ...sessions };
  for (const k of keys) next[k] = { ...next[k], sinceMs: nowMs };
  return { segment: nowMs > fromMs ? { domain, fromMs, toMs: nowMs } : null, next };
}

/**
 * Replace the session for `windowId`, or remove it when `domain` is null.
 * Flushes the window's previous domain union first so shared-domain time is
 * charged exactly once.
 */
export function setWindowSession(
  sessions: SessionMap,
  windowId: number,
  domain: string | null,
  tabId: number,
  nowMs: number,
): { segment: Segment | null; next: SessionMap } {
  const key = String(windowId);
  let map = { ...sessions };
  let segment: Segment | null = null;
  const cur = map[key];
  if (cur) {
    const f = flushDomain(map, cur.domain, nowMs);
    segment = f.segment;
    map = f.next;
  }
  if (domain != null) map[key] = { windowId, tabId, domain, sinceMs: nowMs };
  else delete map[key];
  return { segment, next: map };
}

/** Drop a window's session (window closed or minimized); flushes its domain. */
export function closeWindowSession(
  sessions: SessionMap,
  windowId: number,
  nowMs: number,
): { segment: Segment | null; next: SessionMap } {
  return setWindowSession(sessions, windowId, null, -1, nowMs);
}

/** Alarm tick: flush every visible domain once and re-anchor all sessions. */
export function tickAll(
  sessions: SessionMap,
  nowMs: number,
): { segments: Segment[]; next: SessionMap } {
  let map = sessions;
  const segments: Segment[] = [];
  for (const domain of new Set(Object.values(sessions).map((s) => s.domain))) {
    const f = flushDomain(map, domain, nowMs);
    if (f.segment) segments.push(f.segment);
    map = f.next;
  }
  return { segments, next: map };
}
