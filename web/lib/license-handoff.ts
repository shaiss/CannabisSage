/**
 * Pull a license key from the URL fragment (#key=…) or, briefly, ?key= for
 * older bookmarks. Never leave the key in the address bar or browser history.
 *
 * Injectable location/history for headless smoke tests.
 */
export type LocationLike = Pick<Location, 'href' | 'hash' | 'search' | 'pathname'>;

export type HistoryLike = Pick<History, 'replaceState'>;

/**
 * Clear #key= / legacy ?key= by replacing the current history entry (same
 * effect as location.replace for history — Back will not restore the key —
 * without a full navigation that would drop the key we just read).
 */
export function takeLicenseKeyFromUrl(
  loc: LocationLike | null | undefined =
    typeof window !== 'undefined' ? window.location : null,
  hist: HistoryLike | null | undefined =
    typeof window !== 'undefined' ? window.history : null
): string {
  if (!loc || !hist) return '';

  let key = '';
  const hash = loc.hash.replace(/^#/, '');
  if (hash) {
    key = (new URLSearchParams(hash).get('key') || '').trim();
  }
  if (!key) {
    key = (new URLSearchParams(loc.search).get('key') || '').trim();
  }

  const url = new URL(loc.href);
  const hadQueryKey = url.searchParams.has('key');
  const hadHashKey = Boolean(hash && new URLSearchParams(hash).has('key'));
  if (hadQueryKey || hadHashKey || loc.hash) {
    url.searchParams.delete('key');
    url.hash = '';
    // Replace the current history entry so the original #key= URL cannot be restored via Back.
    hist.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  return key;
}
