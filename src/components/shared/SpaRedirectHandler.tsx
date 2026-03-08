'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Handles client-side navigation after a GitHub Pages 404 redirect.
 *
 * When a user accesses a dynamic URL directly (e.g. /games/new/{uuid}),
 * the static host can't find the file and serves our 404.html, which stores
 * the original path in sessionStorage and redirects to "/". This component
 * runs on the home-page mount, reads that stored path, and navigates there.
 */
export function SpaRedirectHandler() {
  const router = useRouter();

  useEffect(() => {
    try {
      const redirect = sessionStorage.getItem('__spa_redirect');
      if (redirect && redirect !== '/') {
        sessionStorage.removeItem('__spa_redirect');
        router.replace(redirect);
      }
    } catch (e) {}
  }, [router]);

  return null;
}
