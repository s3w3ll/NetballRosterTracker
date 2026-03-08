'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Custom not-found page that acts as a SPA redirect handler for GitHub Pages.
 *
 * When a user directly accesses a dynamic route (e.g. /games/new/<uuid>),
 * GitHub Pages serves out/404.html (this page) because no matching static
 * file exists. We:
 *   1. Store the original URL in sessionStorage.
 *   2. Perform a full page reload to "/" via window.location.replace.
 *
 * After the reload, SpaRedirectHandler (in layout.tsx) reads sessionStorage
 * and navigates the Next.js router to the correct route.
 *
 * We use window.location.replace (full reload) rather than router.replace
 * (SPA navigation) so that the root layout re-mounts and SpaRedirectHandler's
 * useEffect runs fresh.
 */
export default function NotFound() {
  useEffect(() => {
    try {
      const target =
        window.location.pathname +
        window.location.search +
        window.location.hash;

      if (target && target !== '/') {
        sessionStorage.setItem('__spa_redirect', target);
      }
    } catch {
      // sessionStorage unavailable (e.g. private browsing restrictions) — fail silently
    }

    window.location.replace('/');
  }, []);

  // Show a spinner while the redirect happens so the page doesn't flash blank
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
