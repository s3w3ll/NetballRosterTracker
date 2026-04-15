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
