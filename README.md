# Netball Court Time Tracker

A web app for netball coaches and managers to track player court time, plan match lineups, and manage team rosters. Built to solve the common challenge of ensuring fair playing time distribution and managing substitutions during games and tournaments.

**Live site:** [netball.forgesync.co.nz](https://netball.forgesync.co.nz)

## Features

### 🏐 Roster Management
Create and manage team rosters with customizable player lists. Rosters are reusable across multiple games, tournaments, and match plans, providing a single source of truth for your squad.

**Use cases:**
- Manage multiple teams (A-team, B-team, development squad)
- Track player availability and injuries
- Reuse rosters across seasons

### ⏱️ Live Match Tracker
Run a live game with real-time tracking that stays accurate even when you switch browser tabs. Features include:

- **Period timer** with play/pause controls (immune to browser tab throttling)
- **Drag-and-drop player placement** on visual court positions (7-aside or 6-aside formats)
- **Real-time statistics** showing each player's time on court and time per position
- **Mobile-optimized** interface for sideline use on phones/tablets
- **Automatic period tracking** with starting lineup stamping

**Design insight:** The timer uses timestamp-based calculation rather than interval counters to prevent drift when the browser tab is backgrounded—a common issue when coaches check game schedules or messages mid-match.

### 📋 Match Planning
Pre-plan lineups for each period before a game to visualize rotation strategies:

- **Period-by-period lineup builder** with drag-and-drop interface
- **Cumulative time calculations** showing projected court time and position time per player
- **Balance visualization** to ensure fair playing time distribution
- **Save and edit** plans for reuse or adjustments
- **Standalone or tournament mode** for flexible planning workflows

**Use cases:**
- Balance playing time across uneven squad sizes
- Ensure players get experience in their development positions
- Plan around player constraints (e.g., "Sarah can only play first half")

### 🏆 Tournament Management
Group multiple matches into tournaments with intelligent auto-generation:

- **Automatic match scheduling** with configurable parameters (team sizes, match count, period duration)
- **AI-powered position allocation** using a greedy scheduler algorithm
- **Aggregated statistics** showing total court time and position time across all tournament matches
- **Per-game fairness enforcement** to prevent players from dominating single matches
- **Visual tournament overview** with match-by-match breakdowns

**Design insight: Tournament Auto-Generation**

The tournament scheduler solves a complex optimization problem: given N players and M matches, assign positions to maximize fairness across two dimensions:
1. **Total court time** (every player should get similar playing time)
2. **Position variety** (players should rotate through different positions)

The algorithm uses a **greedy weighted scoring system** with per-game constraints:

```
Player Score = (Court Time Weight × Minutes Played) + 
               (Position Zone Weight × Appearances in Zone)
```

For each position in each period, the scheduler:
1. **Filters** players who haven't exceeded per-game limits (e.g., max 3 periods in a 4-period game)
2. **Scores** each eligible player based on historical court time and position frequency
3. **Assigns** the lowest-scoring player (least played/most rested)
4. **Updates** running totals for the next iteration

**Why greedy vs. exhaustive search?** A tournament with 12 players and 5 matches has roughly 10^50 possible assignments. The greedy approach produces near-optimal results in milliseconds rather than hours, with diminishing returns from perfect optimization (a 2-minute difference across 200 minutes is negligible for grassroots netball).

**Per-game fairness:** Without per-game limits, the algorithm could create "bench-heavy" matches where some players barely play. The per-game cap (e.g., 75% of periods) ensures every match has reasonable rotation, preventing frustration for players and parents.

### 🔐 Authentication
Flexible sign-in options powered by Firebase Auth:
- Email/password accounts
- Google OAuth
- Microsoft OAuth
- Anonymous mode (try before you sign up)

## Tech Stack

- **Frontend:** Next.js 15 (App Router) with static export → GitHub Pages
- **Backend:** Cloudflare Workers (Hono framework) + D1 SQLite database
- **Auth:** Firebase Authentication (JWT verification in Worker via jose)
- **UI:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Deployment:** GitHub Actions CI/CD (auto-deploy on push to `main`)
- **Testing:** Vitest (scheduler algorithm + core logic)

## Getting Started

### Prerequisites
- Node.js 20+
- A Firebase project (Auth enabled with Email/Password, Google, and Microsoft providers)
- A Cloudflare account with Workers and D1 database enabled
- Wrangler CLI (`npm install -g wrangler`)

### Local Development

#### Frontend Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/s3w3ll/NetballRosterTracker.git
   cd NetballRosterTracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with your Firebase config:
   ```
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_WORKER_URL=http://localhost:8787
   ```

4. Start the frontend dev server:
   ```bash
   npm run dev
   ```

5. Frontend will be running at [http://localhost:9002](http://localhost:9002)

#### Worker Setup

1. Navigate to the worker directory:
   ```bash
   cd worker
   npm install
   ```

2. Create the local D1 database and apply schema:
   ```bash
   npm run db:apply
   ```

3. Start the worker dev server:
   ```bash
   npm run dev
   ```

4. Worker API will be running at [http://localhost:8787](http://localhost:8787)

### Commands

**Frontend:**
```bash
npm run dev          # Dev server on :9002 (turbopack)
npm run build        # Static export → out/
npm run typecheck    # TypeScript validation
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode for tests
```

**Worker:**
```bash
cd worker
npm run dev              # Local dev server
npm run deploy           # Deploy to Cloudflare Workers
npm run db:apply         # Apply schema to local D1
npm run db:apply:remote  # Apply schema to remote D1
npm run typecheck        # TypeScript validation
```

### Production Build

**Frontend:**
```bash
npm run build
```

Static output is generated in the `out/` directory, ready for GitHub Pages or any static hosting.

**Worker:**
```bash
cd worker
npm run deploy
```

Deploys to Cloudflare Workers. Configure `ALLOWED_ORIGINS` environment variable in Cloudflare dashboard to control CORS.

## Deployment

The app deploys automatically on push to `main`:
- **Frontend:** GitHub Actions builds Next.js static export → GitHub Pages
- **Worker:** GitHub Actions deploys to Cloudflare Workers
- Environment variables (Firebase config, Worker URL) are injected from repository secrets

## Architecture Decisions

### Why Cloudflare Workers + D1 instead of Firebase Firestore?

**Cost:** Firestore pricing scales with read/write operations. A tournament with 12 players and 5 matches generates thousands of reads during planning. Cloudflare D1 has a generous free tier (100k reads/day) and predictable pricing.

**Performance:** D1 SQL queries with JOINs are more efficient than Firestore's document-based reads. Tournament aggregation (sum court time across matches) is a single SQL query vs. multiple document reads + client-side aggregation.

**Offline resilience:** SQLite's relational model is easier to reason about for complex queries and data integrity (cascading deletes, foreign keys).

### Why localStorage routing instead of Next.js dynamic routes?

Static export (`output: 'export'`) doesn't support true dynamic routes. Initially used `generateStaticParams()` with dummy params, but this created confusing UX (bookmarking `/games/[gameId]` breaks on refresh). 

The localStorage approach (`setNavId('gameId', id)` → navigate to `/games/play`) makes URLs stable and bookmarkable while keeping the app fully static.

### Why greedy scheduling instead of machine learning?

The scheduler runs client-side in the browser. A greedy algorithm produces excellent results in <100ms. ML approaches (genetic algorithms, constraint solvers) would require:
- Server-side execution (longer roundtrip, more complex infra)
- Training data (what is "fair"? user preferences vary)
- Explainability issues (coaches want to understand *why* a player is in a position)

Greedy is transparent, fast, and "good enough" for grassroots sports.

## Future Features

### Planned
- **Export tournament reports** to PDF or CSV for team records
- **Player position preferences** (flag preferred positions in roster)
- **Import rosters from CSV** for quick team setup
- **Match history timeline** showing all past games for a roster
- **Undo/redo** for match plan editing
- **Customizable game formats** (create your own period counts and durations)
- **Multi-tournament seasons** (group tournaments into seasonal leaderboards)

### Under Consideration
- **Live match sharing** (QR code for parents/spectators to view real-time stats)
- **Team analytics** (heatmaps showing position coverage over time)
- **Roster comparison** (suggest substitutions based on historical performance)
- **Integration with league management systems** (export to common formats)
- **PWA support** (offline mode for venues with poor connectivity)
- **Automatic period advancement** (timer auto-advances to next period at 0:00)
- **Injury tracking** (mark players unavailable with return dates)

### Long-term Vision
- **Multi-team support** (coaching multiple teams in one account)
- **Collaborative planning** (share match plans with assistant coaches)
- **Mobile apps** (native iOS/Android for better offline support)
- **Real-time sync** (live collaboration during match planning)

## Contributing

This is a personal project built for local netball clubs, but contributions are welcome! If you have ideas or find bugs, feel free to open an issue or submit a PR.

## License

MIT License - see LICENSE file for details.
