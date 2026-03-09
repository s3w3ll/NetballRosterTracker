# NetballRosterTracker - Project Memory

## Architecture
- Next.js 15.5.9 App Router with `output: 'export'` (static site for GitHub Pages)
- **Data backend: Cloudflare Workers + D1 (SQLite)** — migrated from Firestore (PR #7, commit `e3c4703`)
- **Auth: Firebase Auth kept** — email/password, Google OAuth, Microsoft OAuth, anonymous sign-in
- Deployed to: `https://netball.forgesync.co.nz` (GitHub Pages via Actions)
- Worker deployed to: `https://netball-roster-tracker.forgesync.workers.dev`

## Backend: Cloudflare Worker
- Located in `worker/` directory, uses **Hono** framework + **jose** JWT library
- `worker/src/index.ts` — entry point, CORS middleware, auth middleware, route mounts
- `worker/src/auth.ts` — Firebase JWT verification (uses jose, no Firebase Admin SDK needed)
- `worker/src/routes/` — rosters, players, game-formats, matches, match-plans, tournaments
- `worker/schema.sql` — 8-table D1 schema (flat tables with foreign keys + cascading deletes)
- `worker/wrangler.toml` — config; ALLOWED_ORIGINS env var controls CORS
- **CORS critical**: ALLOWED_ORIGINS must be null-safe; `onError` must also set CORS headers or error responses fail CORS checks
- Preflight (OPTIONS) must be handled before auth middleware — browsers send OPTIONS with no Authorization header

## Frontend API Layer (`src/api/`)
- `src/api/client.ts` — `apiFetch()`/`apiJSON()` functions (attach Firebase token via `getIdToken`)
- `src/api/types.ts` — TypeScript interfaces + normalizer functions (D1 snake_case → camelCase)
- `src/api/hooks/use-rosters.ts` — `useRosters()`, `useRoster(id)`
- `src/api/hooks/use-game-formats.ts` — `useGameFormats()`, `useGameFormat(id)` (format WITH positions embedded)
- `src/api/hooks/use-matches.ts` — `useMatches(rosterId)`
- `src/api/hooks/use-match-plans.ts` — `useMatchPlans(matchId)`
- `src/api/hooks/use-tournaments.ts` — `useTournaments()`, `useTournament(id)`
- `src/firebase/non-blocking-updates.tsx` — replaced with Worker-based functions (`upsertMatchPlanNonBlocking`, etc.)
- `src/firebase/provider.tsx` — added `getIdToken(): Promise<string>` via `useCallback([auth])` dep

## Build
- Build script uses `next build` (not `NODE_ENV=production next build` — Windows incompatible)
- Dev: `next dev --turbopack -p 9002`
- `.claude/launch.json` uses full `node` path with `node_modules/next/dist/bin/next` for preview tool

## CI/CD (GitHub Actions)
- Worker deps must be installed (`npm ci` in `worker/`) BEFORE `wrangler deploy` step
- `NEXT_PUBLIC_WORKER_URL` env var set in GitHub Actions for Next.js build
- GitHub OAuth App tokens need `workflow` scope for pushing `.github/workflows/` changes — use `gh auth login --web --scopes workflow` (not `gh auth refresh`)

## Git Workflow
- **Always commit directly to `main`** — no branches, no PRs

## Architecture: localStorage Navigation (post-refactor)
- All 6 dynamic routes replaced with static routes using `localStorage` for entity IDs
- `src/lib/nav.ts` — `setNavId(key, value)` / `getNavId(key)` helpers (keys prefixed `courttime:`)
- Route map: `/games/[gameId]`→`/games/play`, `/games/new/[rosterId]`→`/games/new/configure`, `/plans/new/[rosterId]`→`/plans/new/configure`, `/rosters/[rosterId]`→`/rosters/manage`, `/tournaments/[tournamentId]`→`/tournaments/view`, `[tournamentId]/add-match`→`/tournaments/add-match`
- `SpaRedirectHandler` validates redirect paths: rejects UUID segments (old dynamic routes) and unknown prefixes — only allows known static prefixes (`/games`, `/plans`, `/rosters`, `/tournaments`, `/login`)

## D1 / Game Formats
- Default game formats (7-aside, 6-aside) seeded with `uuidv4()` IDs — not hardcoded strings
- D1 UNIQUE constraints will fail if formats are re-inserted; use upsert/ignore pattern
- 6-aside positions layout: 2 columns × 3 rows (A1/A2, C1/C2, D1/D2)

## Critical: Static Export with Dynamic Routes (legacy, pre-refactor)
- `generateStaticParams()` returning `[]` is treated as **missing** by `output: 'export'` — must return at least one dummy param
- `loader.tsx` uses `useEffect + import('./client')` to avoid SSG of client components
