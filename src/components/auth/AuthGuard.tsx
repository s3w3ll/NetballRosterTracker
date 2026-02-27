'use client';

import { useFirebase } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/** Routes that don't require authentication. */
const PUBLIC_ROUTES = ['/login'];

/**
 * AuthGuard protects app content behind SSO authentication.
 * Anonymous users are treated as unauthenticated and redirected to /login.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useFirebase();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // A user is considered authenticated only if they're a non-anonymous user
  const isAuthenticated = !!user && !user.isAnonymous;

  useEffect(() => {
    if (!isUserLoading && !isAuthenticated && !isPublicRoute) {
      router.push('/login');
    }
  }, [isAuthenticated, isUserLoading, isPublicRoute, router]);

  // Public routes always render (e.g. /login)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading spinner while auth state is resolving
  if (isUserLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Authenticated — render the page
  return <>{children}</>;
}
