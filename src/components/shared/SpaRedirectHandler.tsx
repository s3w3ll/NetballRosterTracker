'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Handles client-side navigation after a GitHub Pages 404 redirect.
 *
 * When a user accesses a path that has no matching static file, GitHub Pages
 * serves out/404.html, which stores the original path in sessionStorage and
 * hard-redirects to "/". This component runs once on initial mount, reads that
 * stored path, validates it is a known static route, and navigates there.
 *
 * Validation is important: stale sessionStorage values from the old
 * dynamic-URL era (e.g. /games/<uuid>) must be discarded rather than
 * redirected, because those routes no longer exist.
 */

/** UUID-like path segment — from the old dynamic-route architecture. */
const DYNAMIC_UUID_RE =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Top-level route prefixes that exist as static pages in the built output. */
const KNOWN_PREFIXES = [
  '/games',
  '/plans',
  '/rosters',
  '/tournaments',
  '/login',
];

function isValidStaticRedirect(path: string): boolean {
  // Reject anything that looks like an old dynamic UUID route.
  if (DYNAMIC_UUID_RE.test(path)) return false;
  // Must begin with a recognised static-route prefix.
  return KNOWN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/'),
  );
}

export function SpaRedirectHandler() {
  const router = useRouter();

  useEffect(() => {
    try {
      const redirect = sessionStorage.getItem('__spa_redirect');
      if (redirect && redirect !== '/') {
        // Always clear — even if we don't follow through with the redirect.
        sessionStorage.removeItem('__spa_redirect');
        if (isValidStaticRedirect(redirect)) {
          router.replace(redirect);
        }
        // else: stale / unknown path — cleared above, user stays at "/"
      }
    } catch (_) {
      // Private-browsing mode may block sessionStorage; ignore.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Run exactly once on mount. `router` is stable in Next.js App Router and
  // is correctly captured in the closure; adding it as a dep would risk a
  // second run if the reference ever changed, re-reading an already-cleared key.

  return null;
}
