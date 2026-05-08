import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // Avoids the PWA plugin mistaking worker/src/index.ts (Cloudflare Worker) for a custom SW.
  customWorkerSrc: 'src/pwa-worker',
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
