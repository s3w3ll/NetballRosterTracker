# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NetballRosterTracker

## Commands

### Frontend (Next.js)
```bash
npm run dev          # Dev server on :9002 (turbopack)
npm run build        # Static export → out/ (also writes SPA 404.html)
npm run typecheck    # tsc --noEmit (3 known pre-existing errors — do not fix unless asked)
npm run test         # vitest run (scheduler algorithm tests)
npm run test:watch   # vitest watch
```

### Worker (Cloudflare)
```bash
cd worker
npm run dev          # wrangler dev (local)
npm run deploy       # wrangler deploy → netball-roster-tracker.forgesync.workers.dev
npm run db:apply     # apply schema.sql to local D1
npm run db:apply:remote  # apply schema.sql to remote D1
npm run typecheck    # tsc --noEmit (1 known pre-existing error in auth.ts)
```

## Architecture

- **Frontend**: Next.js 15 App Router, `output: 'export'` → static site on GitHub Pages (`netball.forgesync.co.nz`)
- **UI**: Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Backend**: Cloudflare Worker (Hono + jose) + D1 (SQLite). Schema in `worker/schema.sql`.
- **Auth**: Firebase Auth (email/password, Google, Microsoft, anonymous). Worker verifies Firebase JWTs via `jose` — no Admin SDK.
- **Deploy**: GitHub Actions builds Next.js + deploys Worker on push to `main`. Always commit directly to `main`.

## Environment Setup

### Frontend
Create `.env.local` with Firebase config:
```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_WORKER_URL=https://netball-roster-tracker.forgesync.workers.dev
```

### Worker
Wrangler CLI uses `wrangler.toml` for configuration. D1 database binding is `DB`. `ALLOWED_ORIGINS` env var controls CORS (set in wrangler.toml or Cloudflare dashboard).

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/nav.ts` | `setNavId`/`getNavId` — localStorage entity routing (replaces dynamic routes) |
| `src/api/client.ts` | `apiFetch`/`apiJSON` — attaches Firebase token to all Worker requests |
| `src/api/types.ts` | TypeScript interfaces + normalizers (D1 snake_case → camelCase) |
| `worker/src/index.ts` | Worker entry: CORS middleware, auth middleware, route mounts |
| `worker/src/routes/` | One file per resource: rosters, players, game-formats, matches, match-plans, tournaments, sub-events |
| `worker/src/lib/scheduler.ts` | Greedy tournament auto-scheduler (court time + zone balance) |

## Navigation Pattern (localStorage routing)

All dynamic routes were replaced with static routes. Entity IDs travel via localStorage:
```
setNavId('rosterId', id)     →  router.push('/rosters/manage')
setNavId('gameId', id)       →  router.push('/games/play')
setNavId('tournamentId', id) →  router.push('/tournaments/view')
```
Keys are prefixed `courttime:` internally. **Always clear `tournamentId` when entering a standalone plan flow** — stale values cause the plan editor to enter tournament mode.

## Gotchas

- **Windows build**: Use `npm run build`, NOT `NODE_ENV=production npm run build` (Windows incompatible)
- **CORS `onError`**: Worker's `onError` handler must also set CORS headers, or error responses fail browser CORS checks
- **Preflight**: OPTIONS must be handled before auth middleware — browsers send OPTIONS with no Authorization header
- **Static export + client components**: Pages that use Firebase hooks need a `loader.tsx` (lazy-imports `client.tsx` via `useEffect`) to avoid SSG failures
- **D1 game format seeds**: Default formats use `uuidv4()` IDs — use upsert/ignore pattern, not plain INSERT
- **Standalone vs tournament plans**: `MatchPlanEditor` checks `Boolean(tournamentId)` to switch modes. Tournament mode buffers saves; standalone mode saves immediately on drag-drop.
- **`GET /api/matches?standalone=true`**: Returns only non-tournament matches (LEFT JOIN anti-join on `tournament_matches`)

## Route Map

| Static Route | Entity |
|-------------|--------|
| `/rosters/manage` | Roster (id via `rosterId`) |
| `/games/play` | Match / live game (id via `gameId`) |
| `/games/play?mode=plan` | Standalone match plan |
| `/plans/new/configure` | New standalone plan setup |
| `/tournaments/view` | Tournament (id via `tournamentId`) |
| `/tournaments/add-match` | Add match to tournament |
