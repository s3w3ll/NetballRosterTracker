/**
 * Post-build script: overwrites out/404.html with a pure-HTML SPA redirect.
 *
 * Next.js static export generates out/404.html from the /_not-found route.
 * GitHub Pages serves this file (with HTTP 404) for any path that has no
 * matching static file — i.e., direct browser navigation to dynamic routes
 * like /games/new/<uuid>.
 *
 * This script replaces that file with minimal HTML that:
 *   1. Stores the original URL in sessionStorage.__spa_redirect
 *   2. Calls window.location.replace('/') to load the Next.js app root
 *
 * SpaRedirectHandler (mounted in layout.tsx) then reads sessionStorage and
 * calls router.replace() to navigate to the intended route.
 *
 * Running as pure HTML (before React/Next.js loads) means this redirect only
 * ever fires for genuine GitHub Pages 404s — never during SPA navigation
 * failures, which would otherwise cause an infinite redirect loop.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CourtTime</title>
    <script>
      // Store the requested path so the Next.js SpaRedirectHandler can
      // navigate back to it once the app root finishes loading.
      (function () {
        var path =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        if (path && path !== '/') {
          try {
            sessionStorage.setItem('__spa_redirect', path);
          } catch (e) {}
        }
        window.location.replace('/');
      })();
    </script>
  </head>
  <body></body>
</html>
`;

const outPath = join(process.cwd(), 'out', '404.html');
writeFileSync(outPath, html, 'utf-8');
console.log('✓ Wrote SPA-redirect 404.html →', outPath);
