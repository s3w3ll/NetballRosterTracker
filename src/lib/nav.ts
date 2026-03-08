/**
 * localStorage-based navigation helpers.
 *
 * Instead of encoding Firestore entity IDs in URL segments (which causes
 * Next.js static export to 404 on RSC payload fetches for unknown IDs),
 * we store the ID in localStorage before navigating and read it back on
 * the destination page.
 *
 * Keys are namespaced to avoid collisions with other browser storage.
 */

export const NAV_KEYS = {
  rosterId: 'courttime:rosterId',
  gameId: 'courttime:gameId',
  tournamentId: 'courttime:tournamentId',
} as const;

type NavKey = keyof typeof NAV_KEYS;

/** Store an ID before navigating to a static route. */
export function setNavId(key: NavKey, value: string): void {
  try {
    localStorage.setItem(NAV_KEYS[key], value);
  } catch {
    // localStorage may be unavailable in private-browsing modes
  }
}

/** Read the ID that was stored before navigation. Returns '' if missing. */
export function getNavId(key: NavKey): string {
  try {
    return localStorage.getItem(NAV_KEYS[key]) ?? '';
  } catch {
    return '';
  }
}
