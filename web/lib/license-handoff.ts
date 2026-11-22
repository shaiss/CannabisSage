/**
 * Pull a license key from the URL fragment (#key=…) or, briefly, ?key= for
 * older bookmarks. Clears the key from the address bar via history.replaceState
 * on the current session-history entry (Back in this tab will not restore it).
 * replaceState does not erase earlier copies that may already sit in the
 * browser's longer-term history store.
 *
 * Injectable location/history for headless smoke tests.
 */
export type LocationLike = Pick<Location, 'href' | 'hash' | 'search' | 'pathname'>;

export type HistoryLike = Pick<History, 'replaceState'>;

/**
 * Clear #key= / legacy ?key= by replacing the current session-history entry
 * (no full navigation that would drop the key we just read). Back will not
 * restore the key from this entry; this is not a guarantee against older
 * history records outside the current entry.
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
    // Replace the current session-history entry so Back does not restore #key=.
    hist.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  return key;
}
