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
