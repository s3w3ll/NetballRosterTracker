# PWA Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CourtTime installable as a Progressive Web App and functional offline, so coaches can use it at venues with poor connectivity.

**Architecture:** Install `@ducanh2912/next-pwa` to generate a Workbox-based service worker during the static export build. The service worker uses cache-first for the Next.js app shell (JS/CSS bundles have content hashes so are safe to cache indefinitely) and network-first with a 10s timeout + cache fallback for the Cloudflare Worker API — so previously-loaded data remains visible when offline. A `manifest.json` and PNG icons enable "Add to Home Screen" on iOS, Android, and desktop Chrome. An `OfflineBanner` component shows a non-blocking amber strip when the device has no connection.

**Tech Stack:** `@ducanh2912/next-pwa` (Workbox), `sharp` (devDep, icon generation), Next.js `output: 'export'`, GitHub Pages (HTTPS already provided)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `public/manifest.json` | Web app manifest (name, icons, colours, display mode) |
| Create | `public/icons/source.svg` | Source vector icon — the only file you design |
| Create | `public/icons/icon-{72,96,128,144,152,180,192,384,512}.png` | Generated PNG icons (committed to repo) |
| Create | `public/icons/icon-512-maskable.png` | Android adaptive icon with safe-zone padding (committed) |
| Create | `scripts/generate-pwa-icons.mjs` | One-off icon generation script (uses sharp) |
| Create | `src/app/offline/page.tsx` | Static offline fallback page served by the service worker |
| Create | `src/components/shared/OfflineBanner.tsx` | Client component: amber banner when `navigator.onLine` is false |
| Modify | `next.config.ts` | Wrap with `withPWA()` — generates sw.js + Workbox + API caching |
| Modify | `src/app/layout.tsx` | Add manifest link, PWA meta tags, `<OfflineBanner />` |
| Modify | `.gitignore` | Ignore generated `public/sw.js` and `public/workbox-*.js` |

---

### Task 1: Install dependencies

**Files:** `package.json`

- [ ] **Install @ducanh2912/next-pwa and sharp**

```bash
npm install @ducanh2912/next-pwa
npm install --save-dev sharp
```

- [ ] **Verify both installed correctly**

```bash
node -e "require('@ducanh2912/next-pwa'); console.log('next-pwa ok')"
node -e "require('sharp'); console.log('sharp ok')"
```

Expected: both lines print `ok`

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add next-pwa and sharp for PWA support"
```

---

### Task 2: Create app icon SVG and generate PNG icons

**Files:**
- Create: `public/icons/source.svg`
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/icon-{72,96,128,144,152,180,192,384,512}.png`
- Create: `public/icons/icon-512-maskable.png`

- [ ] **Create source SVG**

Create `public/icons/source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#4051b5"/>
  <circle cx="256" cy="256" r="148" fill="none" stroke="white" stroke-width="22"/>
  <line x1="108" y1="256" x2="404" y2="256" stroke="white" stroke-width="22"/>
  <circle cx="256" cy="256" r="40" fill="white" opacity="0.9"/>
</svg>
```

This renders as an indigo rounded square with a netball (circle + centre line + dot). Replace with a custom design at any time — re-run the generation script after changing this file.

- [ ] **Create icon generation script**

Create `scripts/generate-pwa-icons.mjs`:

```javascript
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'public/icons/source.svg'));
const outDir = join(process.cwd(), 'public/icons');
mkdirSync(outDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

for (const size of sizes) {
  await sharp(src)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Maskable: content fills 400×400, then 56px padding on each side = 512×512.
// Android's safe zone is the inner 80% so the netball sits well clear of the edge.
await sharp(src)
  .resize(400, 400)
  .extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#4051b5' })
  .png()
  .toFile(join(outDir, 'icon-512-maskable.png'));
console.log('✓ icon-512-maskable.png');
```

- [ ] **Run icon generation**

```bash
node scripts/generate-pwa-icons.mjs
```

Expected output (10 lines):
```
✓ icon-72.png
✓ icon-96.png
✓ icon-128.png
✓ icon-144.png
✓ icon-152.png
✓ icon-180.png
✓ icon-192.png
✓ icon-384.png
✓ icon-512.png
✓ icon-512-maskable.png
```

- [ ] **Commit**

```bash
git add public/icons/ scripts/generate-pwa-icons.mjs
git commit -m "feat(pwa): add app icons and generation script"
```

---

### Task 3: Create web app manifest

**Files:**
- Create: `public/manifest.json`

- [ ] **Create manifest**

Create `public/manifest.json`:

```json
{
  "name": "CourtTime - Netball Tracker",
  "short_name": "CourtTime",
  "description": "Track netball player court time, plan lineups, and manage tournaments",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#e6e9f9",
  "theme_color": "#4051b5",
  "icons": [
    { "src": "/icons/icon-72.png",  "sizes": "72x72",   "type": "image/png" },
    { "src": "/icons/icon-96.png",  "sizes": "96x96",   "type": "image/png" },
    { "src": "/icons/icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Commit**

```bash
git add public/manifest.json
git commit -m "feat(pwa): add web app manifest"
```

---

### Task 4: Configure next.config.ts with withPWA

**Files:**
- Modify: `next.config.ts`

- [ ] **Replace next.config.ts**

```typescript
import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Service worker only active in production builds — dev is unaffected.
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    // When a navigation request fails and there's no cached page, serve /offline.
    document: '/offline',
  },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // Cloudflare Worker API: network-first, fall back to cache after 10s.
        urlPattern: /^https:\/\/netball-roster-tracker\.forgesync\.workers\.dev\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'worker-api-cache',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
    ],
  },
});

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  ...(isProduction ? { output: 'export' as const, trailingSlash: true } : {}),
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co',        port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos',       port: '', pathname: '/**' },
    ],
  },
};

export default withPWA(nextConfig);
```

- [ ] **Commit**

```bash
git add next.config.ts
git commit -m "feat(pwa): configure next-pwa with Workbox and API caching"
```

---

### Task 5: Create offline fallback page

**Files:**
- Create: `src/app/offline/page.tsx`

- [ ] **Create offline page**

Create `src/app/offline/page.tsx`:

```tsx
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <div className="text-6xl">📶</div>
      <h1 className="text-2xl font-bold text-foreground">You're offline</h1>
      <p className="text-muted-foreground max-w-sm">
        No internet connection. Previously viewed rosters, games, and tournament
        plans are still available — navigate to them directly.
      </p>
      <a
        href="/"
        className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
      >
        Go to home
      </a>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/offline/
git commit -m "feat(pwa): add offline fallback page"
```

---

### Task 6: Create OfflineBanner component

**Files:**
- Create: `src/components/shared/OfflineBanner.tsx`

- [ ] **Create component**

Create `src/components/shared/OfflineBanner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Set initial state — window.navigator is only available client-side.
    setIsOffline(!navigator.onLine);
    const onOffline = () => setIsOffline(true);
    const onOnline  = () => setIsOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online',  onOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 text-sm font-medium"
    >
      You're offline — showing cached data
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/components/shared/OfflineBanner.tsx
git commit -m "feat(pwa): add offline status banner"
```

---

### Task 7: Update layout.tsx with PWA meta tags and OfflineBanner

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Replace layout.tsx**

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/shared/Header';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { SpaRedirectHandler } from '@/components/shared/SpaRedirectHandler';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

export const metadata: Metadata = {
  title: 'CourtTime - Netball Tracker',
  description: 'Track netball player court time, substitutions, and game plans.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CourtTime',
  },
};

// Next.js 15: themeColor lives in viewport, not metadata.
export const viewport: Viewport = {
  themeColor: '#4051b5',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        {/* iOS doesn't use the manifest for the home screen icon — explicit tag required. */}
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background">
        <FirebaseClientProvider>
          <SpaRedirectHandler />
          <div className="relative flex min-h-dvh flex-col">
            <Header />
            <main className="flex-1">
              <AuthGuard>{children}</AuthGuard>
            </main>
          </div>
          <Toaster />
          <OfflineBanner />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(pwa): add manifest link, PWA meta tags, and OfflineBanner to layout"
```

---

### Task 8: Update .gitignore for generated PWA files

**Files:**
- Modify: `.gitignore`

- [ ] **Add generated PWA artifacts to .gitignore**

After the `# next.js` block, add:

```
# PWA build artifacts (generated by next-pwa, not committed)
/public/sw.js
/public/sw.js.map
/public/workbox-*.js
/public/workbox-*.js.map
/public/worker-*.js
/public/fallback-*.js
```

- [ ] **Commit**

```bash
git add .gitignore
git commit -m "chore: ignore next-pwa generated service worker files"
```

---

### Task 9: Build and verify PWA

**Files:** None (verification only)

- [ ] **Run production build**

```bash
npm run build
```

Expected: build succeeds. Confirm `public/sw.js` and `public/workbox-*.js` were generated.

- [ ] **Serve the static output**

```bash
npx serve out/ -p 3001 --single
```

Open Chrome at `http://localhost:3001`.

- [ ] **Verify service worker in DevTools**

Chrome DevTools → Application → Service Workers:
- Status: **activated and running**
- Source: `sw.js`

- [ ] **Verify manifest**

Chrome DevTools → Application → Manifest:
- App name: `CourtTime - Netball Tracker`
- All icons listed, no errors
- "Installability" section shows no issues

- [ ] **Test install prompt**

In the Chrome address bar look for the install (⊕) icon. Click it → confirm the app opens in standalone window (no browser chrome, theme colour visible in title bar).

- [ ] **Test offline mode**

1. Load the app and visit the rosters list so it's cached.
2. DevTools → Application → Service Workers → tick **Offline**.
3. Reload — app should load from cache.
4. Navigate to a cached page — it should work normally.
5. Try a page not yet cached — `/offline` fallback should appear.
6. The amber `OfflineBanner` should be visible at the bottom of every screen.

- [ ] **Run Lighthouse PWA audit**

DevTools → Lighthouse → select **Progressive Web App** → Analyze:
- All core checks green ✓ (manifest, service worker, HTTPS, icons)

- [ ] **Push to main and verify on production**

```bash
git push origin main
```

After GitHub Actions deploys, open `https://netball.forgesync.co.nz` in Chrome and confirm:
- Install prompt appears
- Service worker registered (DevTools → Application)
- Offline mode works as above

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Installable on iOS, Android, desktop | 2 (icons) + 3 (manifest) + 7 (meta tags + apple-touch-icon) |
| Offline: app shell loads without network | 4 — next-pwa auto-caches all JS/CSS bundles (cache-first, hashed filenames) |
| Offline: previously-loaded API data visible | 4 — NetworkFirst with 10s timeout + 7-day cache for `workers.dev` |
| Offline: graceful fallback for uncached pages | 4 (`fallbacks.document`) + 5 (offline page) |
| Offline indicator | 6 — OfflineBanner, `role="status"` for screen readers |
| Fonts cached offline | 4 — CacheFirst for `fonts.googleapis.com` + `fonts.gstatic.com` |
| Dev mode unaffected | 4 — `disable: process.env.NODE_ENV === 'development'` |
| Android adaptive icon (safe zone) | 2 — maskable icon with 56px padding on all sides |
| iOS home screen icon | 7 — explicit `<link rel="apple-touch-icon" href="/icons/icon-180.png">` |
| Build artifacts not committed | 8 — `.gitignore` additions |
| `theme_color` without deprecation warning | 7 — `export const viewport: Viewport = { themeColor }` |

### Placeholder scan
No TBD, TODO, or incomplete steps — every step contains the full code.

### Type consistency
- `OfflineBanner` exported from `src/components/shared/OfflineBanner.tsx` and imported by that exact name in `layout.tsx`.
- `viewport` exported as `Viewport` type (from `'next'`) in `layout.tsx` — correct for Next.js 15 App Router.
- `withPWA(nextConfig)` in `next.config.ts` — `nextConfig` is typed `NextConfig`, `withPWA` wraps and returns the same type.
