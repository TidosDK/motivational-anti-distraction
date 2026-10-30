/** Parse user input into a bare, lowercase domain (no scheme/path/port/www). */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip scheme
  s = s.split('@').pop() ?? ''; // strip userinfo
  s = s.split(/[/?#]/)[0]; // strip path, query, fragment
  s = s.split(':')[0]; // strip port
  s = s.replace(/\.+$/, ''); // strip trailing dot(s)
  if (s.startsWith('www.')) s = s.slice(4);
  if (/\s/.test(s)) return null;
  const label = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
  if (!new RegExp(`^${label}(?:\\.${label})+$`).test(s)) return null;
  return s;
}

/** Hostname of an http(s) URL, or null. */
export function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True if `host` is `domain` or a subdomain of it. */
export function domainMatches(host: string, domain: string): boolean {
  const h = host.replace(/\.+$/, '').replace(/^www\./, '');
  return h === domain || h.endsWith(`.${domain}`);
}
