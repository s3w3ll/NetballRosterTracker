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
