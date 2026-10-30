/**
 * Foreground-only session accounting (design D3). The service worker keeps at
 * most one active session: the foreground tab of the focused window. All
 * transitions are pure so they can be unit-tested without chrome APIs.
 */

export interface ActiveSession {
  windowId: number;
  tabId: number;
  domain: string;
  sinceMs: number;
}

/** Seconds to charge to a domain, or null when nothing accrued. */
export function closeSession(
  session: ActiveSession | null,
  nowMs: number,
): { domain: string; fromMs: number; toMs: number } | null {
  if (!session) return null;
  if (nowMs <= session.sinceMs) return null;
  return { domain: session.domain, fromMs: session.sinceMs, toMs: nowMs };
}

/**
 * Move focus to `domain` in (windowId, tabId), or to nothing when domain is
 * null. Returns the closed segment (to accrue) and the new active session.
 */
export function switchFocus(
  current: ActiveSession | null,
  domain: string | null,
  tabId: number,
  windowId: number,
  nowMs: number,
): { closed: ReturnType<typeof closeSession>; next: ActiveSession | null } {
  const closed = closeSession(current, nowMs);
  const next =
    domain != null ? { windowId, tabId, domain, sinceMs: nowMs } : null;
  return { closed, next };
}

/**
 * Alarm tick while a blocked site stays focused: accrue since -> now and
 * re-anchor the session so a worker death loses at most one tick of data.
 */
export function tickSession(
  session: ActiveSession,
  nowMs: number,
): { accrued: ReturnType<typeof closeSession>; next: ActiveSession } {
  const accrued = closeSession(session, nowMs);
  return {
    accrued: accrued ?? { domain: session.domain, fromMs: session.sinceMs, toMs: session.sinceMs },
    next: { ...session, sinceMs: nowMs },
  };
}
