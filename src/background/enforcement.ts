import { isSiteExhausted } from '../shared/exhaustion';
import type { DayState, Settings } from '../shared/types';

/** Domains that must currently be redirected (exhausted, no active pass). */
export function computeBlockedDomains(settings: Settings, state: DayState): string[] {
  return settings.sites
    .filter((s) => isSiteExhausted(s.domain, state, settings))
    .map((s) => s.domain)
    .sort();
}

/** Escapes a normalized domain for use inside a regexFilter. */
export function regexFilterFor(domain: string): string {
  const escaped = domain.replace(/\./g, '\\.');
  return `^https?://(?:[a-zA-Z0-9-]+\\.)*${escaped}(:[0-9]+)?(/|$|\\?)`;
}

export interface RuleSpec {
  id: number;
  domain: string;
  redirectUrl: string;
}

export interface ExistingRule {
  id: number;
  redirectUrl: string;
}

/** Recompute-and-diff so the dynamic rule set always mirrors desired state. */
export function diffRules(desired: RuleSpec[], existing: ExistingRule[]): {
  add: RuleSpec[];
  removeIds: number[];
} {
  const desiredById = new Map(desired.map((r) => [r.id, r]));
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const add = desired.filter((d) => existingById.get(d.id)?.redirectUrl !== d.redirectUrl);
  const removeIds = [...existingById.keys()].filter(
    (id) => desiredById.get(id)?.redirectUrl !== existingById.get(id)?.redirectUrl,
  );
  return { add, removeIds };
}
