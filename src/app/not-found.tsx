import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Rendered by Next.js App Router when no route matches (SPA navigation
 * failure). This is a simple server component — it does NOT redirect.
 *
 * GitHub Pages 404 fallback (direct URL access to dynamic routes) is handled
 * separately by out/404.html, which is overwritten after the build by
 * scripts/generate-spa-404.mjs with a pure-HTML sessionStorage redirect.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4 text-center px-4">
      <h2 className="text-4xl font-bold font-headline">Page Not Found</h2>
      <p className="text-muted-foreground max-w-sm">
        This page doesn&apos;t exist or may have moved.
      </p>
      <Button asChild>
        <Link href="/">Go Home</Link>
      </Button>
    </div>
  );
}
