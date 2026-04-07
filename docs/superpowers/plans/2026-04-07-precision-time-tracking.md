# Precision Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the whole-period `match_plans` snapshot model with a `sub_events` event log that records exactly when within a period each player moved to a position, enabling partial-period tracking, mid-game time recovery, manual sub-time entry, and accurate tournament summaries.

**Architecture:** A new D1 `sub_events` table stores one row per player transition (`seconds_elapsed=0` = starting lineup, `position_abbr=NULL` = bench). A shared pure function `calculatePlayerTimes()` derives all time totals from this log. The live game UI stamps events on each drag-drop; plan mode allows manual time entry. Existing `match_plans` data is migrated then deprecated.

**Tech Stack:** Cloudflare Workers + D1 (Hono), Next.js 15 App Router (static export), Firebase Auth, Vitest (new — unit testing the calculation utility), TypeScript, shadcn/ui, uuid

---

## File Map

**New files:**
- `vitest.config.ts` — Vitest config with `@/` path alias
- `worker/src/routes/sub-events.ts` — Hono route: GET, POST, PUT, DELETE, bulk POST
- `worker/src/routes/migrate.ts` — one-time migration route (match_plans → sub_events)
- `src/lib/time-calculations.ts` — pure calculation functions (no hooks, no side effects)
- `src/lib/time-calculations.test.ts` — Vitest unit tests
- `src/api/hooks/use-sub-events.ts` — React hook mirroring use-match-plans.ts pattern
- `src/app/games/play/components/SubEventPanel.tsx` — collapsible sub event editor panel
- `src/app/games/play/components/MatchPlanEditor.tsx` — new plan-mode editor (replaces MatchPlanner)

**Modified files:**
- `package.json` — add `vitest` devDep, add `test`/`test:watch` scripts
- `worker/schema.sql` — add `sub_events` table
- `worker/src/index.ts` — mount sub-events and migrate routes
- `src/api/types.ts` — add `SubEvent` interface, `normalizeSubEvent()`, `positionGroup` on `Position`
- `src/firebase/non-blocking-updates.tsx` — add `createSubEventNonBlocking`, `bulkCreateSubEventsNonBlocking`, `updateSubEventNonBlocking`, `deleteSubEventNonBlocking`
- `src/app/games/play/client.tsx` — update `LiveGameTracker` (editable timer, sub stamping, period advance), wire `SubEventPanel`, replace `MatchPlanner` with `MatchPlanEditor`, update `TournamentHistoryPanel`
- `src/app/tournaments/view/client.tsx` — swap to `calculatePlayerTimes` + sub events fetch

---

## Task 1: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Expected: vitest appears in `package.json` devDependencies.

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

```bash
npm test
```

Expected output: `No test files found` or similar — no errors, exit 0.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add Vitest for unit testing"
```

---

## Task 2: Schema — Add sub_events Table

**Files:**
- Modify: `worker/schema.sql`

- [ ] **Step 1: Add sub_events table to schema.sql**

Append to the end of `worker/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS sub_events (
  id              TEXT PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  period          INTEGER NOT NULL,
  seconds_elapsed INTEGER NOT NULL DEFAULT 0,
  player_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position_abbr   TEXT  -- NULL means player is going to bench
);
```

- [ ] **Step 2: Apply sub_events table to local D1**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --local --command "CREATE TABLE IF NOT EXISTS sub_events (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE, user_id TEXT NOT NULL, period INTEGER NOT NULL, seconds_elapsed INTEGER NOT NULL DEFAULT 0, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, position_abbr TEXT)"
```

Expected: `Done executing...` with no errors.

- [ ] **Step 3: Apply position_group column to local D1**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --local --command "ALTER TABLE positions ADD COLUMN position_group TEXT"
```

Expected: `Done executing...` with no errors.

- [ ] **Step 4: Apply sub_events table to production D1**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --remote --command "CREATE TABLE IF NOT EXISTS sub_events (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE, user_id TEXT NOT NULL, period INTEGER NOT NULL, seconds_elapsed INTEGER NOT NULL DEFAULT 0, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, position_abbr TEXT)"
```

Expected: `Done executing...` with no errors.

- [ ] **Step 5: Apply position_group column to production D1**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --remote --command "ALTER TABLE positions ADD COLUMN position_group TEXT"
```

Expected: `Done executing...` with no errors.

- [ ] **Step 6: Commit schema change**

```bash
cd .. && git add worker/schema.sql
git commit -m "feat(schema): add sub_events table and position_group column"
```

---

## Task 3: Time Calculation Utility (TDD)

**Files:**
- Create: `src/lib/time-calculations.ts`
- Create: `src/lib/time-calculations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/time-calculations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculatePlayerTimes, groupPositionTimes } from './time-calculations'

// Minimal SubEvent shape used in tests
const ev = (
  period: number,
  secondsElapsed: number,
  playerId: string,
  positionAbbr: string | null
) => ({ id: 'x', matchId: 'm1', period, secondsElapsed, playerId, positionAbbr })

describe('calculatePlayerTimes', () => {
  it('returns empty object for empty event list', () => {
    expect(calculatePlayerTimes([], 720)).toEqual({})
  })

  it('credits full period when player starts and never subs off', () => {
    const result = calculatePlayerTimes([ev(1, 0, 'p1', 'GS')], 720)
    expect(result['p1'].total).toBe(720)
    expect(result['p1'].positions['GS']).toBe(720)
  })

  it('credits partial time when player subs off mid-period', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 270, 'p1', null),
    ], 720)
    expect(result['p1'].total).toBe(270)
    expect(result['p1'].positions['GS']).toBe(270)
  })

  it('credits only the time from sub-on to period end when player comes on mid-period', () => {
    const result = calculatePlayerTimes([ev(1, 270, 'p1', 'GS')], 720)
    expect(result['p1'].total).toBe(450)   // 720 - 270
    expect(result['p1'].positions['GS']).toBe(450)
  })

  it('handles player who subs off and back on in same period without double-counting', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 240, 'p1', null),  // off at 4:00
      ev(1, 360, 'p1', 'GA'),  // back on at 6:00
    ], 720)
    expect(result['p1'].positions['GS']).toBe(240)
    expect(result['p1'].positions['GA']).toBe(360)  // 720 - 360
    expect(result['p1'].total).toBe(600)
  })

  it('accumulates time correctly across multiple periods', () => {
    const result = calculatePlayerTimes([
      ev(1, 0, 'p1', 'GS'),
      ev(2, 0, 'p1', 'GA'),
    ], 720)
    expect(result['p1'].total).toBe(1440)
    expect(result['p1'].positions['GS']).toBe(720)
    expect(result['p1'].positions['GA']).toBe(720)
  })

  it('tracks multiple players independently in same period', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 0,   'p2', 'GA'),
      ev(1, 360, 'p1', null),  // p1 off halfway
    ], 720)
    expect(result['p1'].total).toBe(360)
    expect(result['p2'].total).toBe(720)
  })
})

describe('groupPositionTimes', () => {
  it('collapses sub-positions into parent group', () => {
    const times = { A1: 480, A2: 480, C1: 720 }
    const groups: Record<string, string | null> = { A1: 'A', A2: 'A', C1: 'C', C2: 'C' }
    expect(groupPositionTimes(times, groups)).toEqual({ A: 960, C: 720 })
  })

  it('uses position key as-is when positionGroup is null', () => {
    const times = { GS: 720, GA: 360 }
    const groups: Record<string, string | null> = { GS: null, GA: null }
    expect(groupPositionTimes(times, groups)).toEqual({ GS: 720, GA: 360 })
  })

  it('mixes grouped and ungrouped positions', () => {
    const times = { A1: 300, A2: 300, GS: 720 }
    const groups: Record<string, string | null> = { A1: 'A', A2: 'A', GS: null }
    expect(groupPositionTimes(times, groups)).toEqual({ A: 600, GS: 720 })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: Fails with `Cannot find module './time-calculations'`.

- [ ] **Step 3: Implement time-calculations.ts**

Create `src/lib/time-calculations.ts`:

```typescript
export interface SubEvent {
  id: string
  matchId: string
  period: number
  secondsElapsed: number
  playerId: string
  positionAbbr: string | null  // null = bench
}

export type PlayerTimeTotals = Record<string, {
  total: number
  positions: Record<string, number>
}>

/**
 * Derives how long each player spent in each position from a list of sub events.
 * Events are grouped by period internally; no need to pass numberOfPeriods.
 * @param subEvents  All sub events for one match (any order).
 * @param periodDuration  Duration of one period in seconds.
 */
export function calculatePlayerTimes(
  subEvents: SubEvent[],
  periodDuration: number
): PlayerTimeTotals {
  const totals: PlayerTimeTotals = {}

  // Group events by period
  const byPeriod = new Map<number, SubEvent[]>()
  for (const event of subEvents) {
    if (!byPeriod.has(event.period)) byPeriod.set(event.period, [])
    byPeriod.get(event.period)!.push(event)
  }

  for (const [, periodEvents] of byPeriod) {
    // Group by player within this period
    const byPlayer = new Map<string, SubEvent[]>()
    for (const event of periodEvents) {
      if (!byPlayer.has(event.playerId)) byPlayer.set(event.playerId, [])
      byPlayer.get(event.playerId)!.push(event)
    }

    for (const [playerId, playerEvents] of byPlayer) {
      if (!totals[playerId]) totals[playerId] = { total: 0, positions: {} }

      // Sort ascending by secondsElapsed
      playerEvents.sort((a, b) => a.secondsElapsed - b.secondsElapsed)

      let currentPosition: string | null = null
      let onTime = 0

      for (const event of playerEvents) {
        if (event.positionAbbr !== null) {
          // Player coming on to a position
          currentPosition = event.positionAbbr
          onTime = event.secondsElapsed
        } else {
          // Player going to bench
          if (currentPosition !== null) {
            const interval = event.secondsElapsed - onTime
            totals[playerId].positions[currentPosition] =
              (totals[playerId].positions[currentPosition] || 0) + interval
            totals[playerId].total += interval
            currentPosition = null  // must reset to prevent double-counting
          }
        }
      }

      // Still on court at end of period
      if (currentPosition !== null) {
        const interval = periodDuration - onTime
        totals[playerId].positions[currentPosition] =
          (totals[playerId].positions[currentPosition] || 0) + interval
        totals[playerId].total += interval
      }
    }
  }

  return totals
}

/**
 * Collapses sub-position keys (e.g. A1, A2) into their parent group (e.g. A).
 * Positions with positionGroup = null are kept as-is.
 * @param positionTimes  Map of positionAbbr → seconds.
 * @param positionGroups  Map of positionAbbr → group key (or null).
 */
export function groupPositionTimes(
  positionTimes: Record<string, number>,
  positionGroups: Record<string, string | null>
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [abbr, seconds] of Object.entries(positionTimes)) {
    const group = positionGroups[abbr] ?? abbr
    result[group] = (result[group] || 0) + seconds
  }
  return result
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: `10 tests | 10 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time-calculations.ts src/lib/time-calculations.test.ts
git commit -m "feat: add calculatePlayerTimes and groupPositionTimes with tests"
```

---

## Task 4: Sub Events Worker Route

**Files:**
- Create: `worker/src/routes/sub-events.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Create sub-events route**

Create `worker/src/routes/sub-events.ts`:

```typescript
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env, Variables } from '../index'

const subEvents = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/matches/:matchId/sub-events
subEvents.get('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  const rows = await c.env.DB.prepare(
    'SELECT * FROM sub_events WHERE match_id = ? ORDER BY period ASC, seconds_elapsed ASC'
  ).bind(matchId).all()

  return c.json(rows.results)
})

// POST /api/matches/:matchId/sub-events/bulk  — MUST be registered before /:id
subEvents.post('/bulk', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{
    events: Array<{
      id?: string
      period: number
      secondsElapsed: number
      playerId: string
      positionAbbr: string | null
    }>
  }>()

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  if (body.events.length === 0) return c.json({ count: 0 }, 201)

  const stmt = c.env.DB.prepare(
    'INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const inserts = body.events.map(e =>
    stmt.bind(e.id ?? uuidv4(), matchId, userId, e.period, e.secondsElapsed, e.playerId, e.positionAbbr ?? null)
  )
  await c.env.DB.batch(inserts)

  return c.json({ count: body.events.length }, 201)
})

// POST /api/matches/:matchId/sub-events
subEvents.post('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{
    id?: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  }>()

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  const id = body.id ?? uuidv4()
  await c.env.DB.prepare(
    'INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, matchId, userId, body.period, body.secondsElapsed, body.playerId, body.positionAbbr ?? null).run()

  return c.json({ id }, 201)
})

// PUT /api/matches/:matchId/sub-events/:id
subEvents.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{
    secondsElapsed: number
    positionAbbr: string | null
  }>()

  const result = await c.env.DB.prepare(
    'UPDATE sub_events SET seconds_elapsed = ?, position_abbr = ? WHERE id = ? AND user_id = ?'
  ).bind(body.secondsElapsed, body.positionAbbr, id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

// DELETE /api/matches/:matchId/sub-events/:id
subEvents.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const result = await c.env.DB.prepare(
    'DELETE FROM sub_events WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default subEvents
```

- [ ] **Step 2: Mount the route in index.ts**

In `worker/src/index.ts`, add the import and route:

```typescript
// Add import with the others:
import subEvents from './routes/sub-events'

// Add route mount after the existing /api/matches line:
app.route('/api/matches/:matchId/sub-events', subEvents)
```

The full imports block at the top of `worker/src/index.ts` should now be:
```typescript
import rosters from './routes/rosters'
import players from './routes/players'
import gameFormats from './routes/game-formats'
import positions from './routes/positions'
import matches from './routes/matches'
import matchPlans from './routes/match-plans'
import subEvents from './routes/sub-events'
import tournaments from './routes/tournaments'
```

And the routes section:
```typescript
app.route('/api/rosters', rosters)
app.route('/api/rosters/:rosterId/players', players)
app.route('/api/players', players)
app.route('/api/game-formats', gameFormats)
app.route('/api/positions', positions)
app.route('/api/matches', matches)
app.route('/api/matches/:matchId/plans', matchPlans)
app.route('/api/match-plans', matchPlans)
app.route('/api/matches/:matchId/sub-events', subEvents)
app.route('/api/tournaments', tournaments)
```

- [ ] **Step 3: Deploy worker to verify no TypeScript errors**

```bash
cd worker && npx wrangler deploy
```

Expected: `Deployed netball-roster-tracker` with no TypeScript errors.

- [ ] **Step 4: Smoke test the GET endpoint**

```bash
# Replace TOKEN with a valid Firebase ID token from the browser devtools
curl -H "Authorization: Bearer TOKEN" \
  https://netball-roster-tracker.forgesync.workers.dev/api/matches/ANY_MATCH_ID/sub-events
```

Expected: `[]` (empty array — no events yet).

- [ ] **Step 5: Commit**

```bash
cd .. && git add worker/src/routes/sub-events.ts worker/src/index.ts
git commit -m "feat(worker): add sub_events CRUD + bulk routes"
```

---

## Task 5: Migration Worker Route

**Files:**
- Create: `worker/src/routes/migrate.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/wrangler.toml` (note: MIGRATION_SECRET added as a Wrangler secret, not in the file)

- [ ] **Step 1: Add MIGRATION_SECRET to Env type in worker/src/index.ts**

Update the `Env` type:

```typescript
export type Env = {
  DB: D1Database
  FIREBASE_PROJECT_ID: string
  ALLOWED_ORIGINS: string
  MIGRATION_SECRET?: string
}
```

- [ ] **Step 2: Create migration route**

Create `worker/src/routes/migrate.ts`:

```typescript
import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env } from '../index'

const migrate = new Hono<{ Bindings: Env }>()

// POST /migrate/match-plans
// Not Firebase-JWT-guarded — uses X-Migration-Secret header instead.
// Run once by the developer; idempotent via INSERT OR IGNORE.
migrate.post('/match-plans', async (c) => {
  const secret = c.req.header('X-Migration-Secret')
  if (!c.env.MIGRATION_SECRET || secret !== c.env.MIGRATION_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const plans = await c.env.DB.prepare('SELECT * FROM match_plans').all()
  if (plans.results.length === 0) {
    return c.json({ plans: 0, migrated: 0, skipped: 0 })
  }

  let migrated = 0
  let skipped = 0

  for (const plan of plans.results as any[]) {
    let positions: Array<{ playerId: string; position: string }>
    try {
      positions = JSON.parse(plan.player_positions as string)
    } catch {
      skipped++
      continue
    }

    if (!positions || positions.length === 0) {
      skipped++
      continue
    }

    const inserts = positions.map(pos =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO sub_events
          (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuidv4(),
        plan.match_id,
        plan.user_id,
        plan.quarter,
        0,
        pos.playerId,
        pos.position
      )
    )

    await c.env.DB.batch(inserts)
    migrated += inserts.length
  }

  return c.json({ plans: plans.results.length, migrated, skipped })
})

export default migrate
```

- [ ] **Step 3: Mount migrate route in index.ts (no auth middleware)**

In `worker/src/index.ts`, add before `app.onError`:

```typescript
import migrate from './routes/migrate'

// Mounted OUTSIDE /api/* so it bypasses the auth middleware
app.route('/migrate', migrate)
```

- [ ] **Step 4: Set MIGRATION_SECRET as a Wrangler secret**

```bash
cd worker && npx wrangler secret put MIGRATION_SECRET
```

When prompted, enter a secure random string (e.g., generate with `openssl rand -hex 32`). Save this value — you will need it in Task 15.

- [ ] **Step 5: Deploy worker**

```bash
cd worker && npx wrangler deploy
```

Expected: `Deployed netball-roster-tracker` with no errors.

- [ ] **Step 6: Commit**

```bash
cd .. && git add worker/src/routes/migrate.ts worker/src/index.ts
git commit -m "feat(worker): add match-plans migration route with secret auth"
```

---

## Task 6: Frontend Types — SubEvent + Position.positionGroup

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: Add SubEvent interface and normalizer to src/api/types.ts**

Add after the `MatchPlan` interface:

```typescript
export interface SubEvent {
  id: string
  matchId: string
  period: number
  secondsElapsed: number
  playerId: string
  positionAbbr: string | null  // null = bench
}
```

Add after `normalizeMatchPlan`:

```typescript
export function normalizeSubEvent(raw: any): SubEvent {
  return {
    id: raw.id,
    matchId: raw.match_id,
    period: raw.period,
    secondsElapsed: raw.seconds_elapsed,
    playerId: raw.player_id,
    positionAbbr: raw.position_abbr ?? null,
  }
}
```

- [ ] **Step 2: Add positionGroup to Position interface**

Update `Position` interface:

```typescript
export interface Position {
  id: string
  name: string
  abbreviation: string
  icon?: string
  gameFormatId: string
  positionGroup?: string | null  // e.g. 'A' for A1/A2 in 6-aside; null = no grouping
}
```

Update `normalizePosition`:

```typescript
export function normalizePosition(raw: any): Position {
  return {
    id: raw.id,
    name: raw.name,
    abbreviation: raw.abbreviation,
    icon: raw.icon ?? undefined,
    gameFormatId: raw.game_format_id,
    positionGroup: raw.position_group ?? null,
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(types): add SubEvent interface, normalizeSubEvent, Position.positionGroup"
```

---

## Task 7: use-sub-events Hook

**Files:**
- Create: `src/api/hooks/use-sub-events.ts`

- [ ] **Step 1: Create hook**

Create `src/api/hooks/use-sub-events.ts`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useFirebase } from '@/firebase'
import { apiFetch, apiJSON } from '@/api/client'
import { normalizeSubEvent, type SubEvent } from '@/api/types'

export function useSubEvents(matchId: string | null | undefined) {
  const { getIdToken } = useFirebase()
  const [data, setData] = useState<SubEvent[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    if (!matchId) {
      setData(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const rows = await apiJSON<any[]>(`/api/matches/${matchId}/sub-events`, getIdToken)
      setData(rows.map(normalizeSubEvent))
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [matchId, getIdToken])

  useEffect(() => { refetch() }, [refetch])

  const create = useCallback(async (event: Omit<SubEvent, 'id' | 'matchId'>) => {
    if (!matchId) return undefined
    const id = uuidv4()
    await apiFetch(`/api/matches/${matchId}/sub-events`, getIdToken, {
      method: 'POST',
      body: JSON.stringify({ id, ...event }),
    })
    await refetch()
    return id
  }, [matchId, getIdToken, refetch])

  const update = useCallback(async (
    id: string,
    changes: { secondsElapsed: number; positionAbbr: string | null }
  ) => {
    if (!matchId) return
    await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'PUT',
      body: JSON.stringify(changes),
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  const remove = useCallback(async (id: string) => {
    if (!matchId) return
    await apiFetch(`/api/matches/${matchId}/sub-events/${id}`, getIdToken, {
      method: 'DELETE',
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  const bulkCreate = useCallback(async (events: Array<Omit<SubEvent, 'id' | 'matchId'>>) => {
    if (!matchId || events.length === 0) return
    await apiFetch(`/api/matches/${matchId}/sub-events/bulk`, getIdToken, {
      method: 'POST',
      body: JSON.stringify({ events: events.map(e => ({ id: uuidv4(), ...e })) }),
    })
    await refetch()
  }, [matchId, getIdToken, refetch])

  return { data, isLoading, error, refetch, create, update, remove, bulkCreate }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/hooks/use-sub-events.ts
git commit -m "feat(hooks): add useSubEvents hook with create/update/remove/bulkCreate"
```

---

## Task 8: Non-Blocking Sub Event Write Functions

**Files:**
- Modify: `src/firebase/non-blocking-updates.tsx`

- [ ] **Step 1: Add non-blocking sub event functions**

Append to `src/firebase/non-blocking-updates.tsx`:

```typescript
/**
 * Creates a sub event (position assignment or bench). Does NOT await the result.
 */
export function createSubEventNonBlocking(
  matchId: string,
  event: {
    id: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events`, getIdToken, {
    method: 'POST',
    body: JSON.stringify(event),
  }).catch((err) => console.error('createSubEventNonBlocking failed', err))
}

/**
 * Creates multiple sub events in one request (e.g. starting lineup). Does NOT await.
 */
export function bulkCreateSubEventsNonBlocking(
  matchId: string,
  events: Array<{
    id: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  }>,
  getIdToken: GetIdToken
) {
  if (events.length === 0) return
  apiFetch(`/api/matches/${matchId}/sub-events/bulk`, getIdToken, {
    method: 'POST',
    body: JSON.stringify({ events }),
  }).catch((err) => console.error('bulkCreateSubEventsNonBlocking failed', err))
}

/**
 * Updates a sub event's time and/or position. Does NOT await.
 */
export function updateSubEventNonBlocking(
  matchId: string,
  eventId: string,
  changes: { secondsElapsed: number; positionAbbr: string | null },
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events/${eventId}`, getIdToken, {
    method: 'PUT',
    body: JSON.stringify(changes),
  }).catch((err) => console.error('updateSubEventNonBlocking failed', err))
}

/**
 * Deletes a sub event. Does NOT await.
 */
export function deleteSubEventNonBlocking(
  matchId: string,
  eventId: string,
  getIdToken: GetIdToken
) {
  apiFetch(`/api/matches/${matchId}/sub-events/${eventId}`, getIdToken, {
    method: 'DELETE',
  }).catch((err) => console.error('deleteSubEventNonBlocking failed', err))
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/firebase/non-blocking-updates.tsx
git commit -m "feat: add non-blocking sub event write functions"
```

---

## Task 9: LiveGameTracker — Editable Timer

**Files:**
- Modify: `src/app/games/play/client.tsx`

This task only changes the timer display in `LiveGameTracker`. The `LiveGameTracker` function starts at line 62.

- [ ] **Step 1: Add editingTimer state to LiveGameTracker**

Inside `LiveGameTracker`, after the existing state declarations (around line 70), add:

```typescript
const [isEditingTimer, setIsEditingTimer] = useState(false)
const [timerInputValue, setTimerInputValue] = useState('')
```

- [ ] **Step 2: Add handler functions for timer editing**

Add these two handlers inside `LiveGameTracker` after `advancePeriod`:

```typescript
const handleTimerClick = () => {
  if (isActive) setIsActive(false)
  setTimerInputValue(formatTime(time))
  setIsEditingTimer(true)
}

const handleTimerInputConfirm = () => {
  const parts = timerInputValue.split(':')
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10)
    const secs = parseInt(parts[1], 10)
    if (!isNaN(mins) && !isNaN(secs)) {
      setTime(mins * 60 + secs)
    }
  }
  setIsEditingTimer(false)
}
```

- [ ] **Step 3: Replace the timer display in the render section**

Find this block in the render (around line 394):

```typescript
<div className="text-4xl font-bold font-mono tracking-tighter">{formatTime(time)}</div>
```

Replace with:

```typescript
{isEditingTimer ? (
  <input
    type="text"
    className="text-4xl font-bold font-mono tracking-tighter w-32 bg-transparent border-b-2 border-primary focus:outline-none"
    value={timerInputValue}
    onChange={e => setTimerInputValue(e.target.value)}
    onBlur={handleTimerInputConfirm}
    onKeyDown={e => { if (e.key === 'Enter') handleTimerInputConfirm() }}
    autoFocus
  />
) : (
  <div
    className="text-4xl font-bold font-mono tracking-tighter cursor-pointer hover:text-primary transition-colors"
    title="Tap to correct timer"
    onClick={handleTimerClick}
  >
    {formatTime(time)}
  </div>
)}
```

- [ ] **Step 4: Verify the app builds**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. The timer should now be tappable.

- [ ] **Step 5: Commit**

```bash
git add src/app/games/play/client.tsx
git commit -m "feat(live-game): editable timer for time recovery"
```

---

## Task 10: LiveGameTracker — Sub Stamping + Period Advance

**Files:**
- Modify: `src/app/games/play/client.tsx`

This task adds sub event writing to drag-drop and period advance. The in-memory time accumulation stays as-is for smooth live display.

- [ ] **Step 1: Add matchId and getIdToken props to LiveGameTracker**

Update `LiveGameTracker` function signature (currently `{ match, gameFormat, positions, players }`):

```typescript
function LiveGameTracker({
  match,
  gameFormat,
  positions,
  players,
}: {
  match: any
  gameFormat: any
  positions: any[]
  players: any[]
}) {
```

Add to imports at the top of the file:

```typescript
import { v4 as uuidv4 } from 'uuid'
import {
  createSubEventNonBlocking,
  bulkCreateSubEventsNonBlocking,
} from '@/firebase/non-blocking-updates'
```

Add `getIdToken` inside `LiveGameTracker` body (it already has access via `useFirebase` — check whether `useFirebase` is imported at the top of the function):

```typescript
const { getIdToken } = useFirebase()
```

(Note: `useFirebase` is already imported at the file level — this is already used in `MatchPlanner`. Just add this line inside `LiveGameTracker` if not already there.)

- [ ] **Step 2: Update handleDrop to stamp a sub event**

Find `handleDrop` (around line 196). Replace it with:

```typescript
const handleDrop = (e: DragEvent<HTMLDivElement>, positionAbbr: string) => {
  e.preventDefault()
  const playerId = e.dataTransfer.getData('playerId')
  if (!playerId) return

  updatePlayerTimes()

  const secondsElapsed = gameFormat
    ? gameFormat.periodDuration * 60 - time
    : 0

  setCourtPositions(prev => {
    const newPositions = { ...prev }
    const currentOccupantId = newPositions[positionAbbr]
    const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId)

    // If there was a player in this spot, they swap to the dragged player's old spot
    if (oldPosOfDraggedPlayer) {
      newPositions[oldPosOfDraggedPlayer] = currentOccupantId
      if (currentOccupantId) {
        // Stamp the swapped-in player's new position
        createSubEventNonBlocking(match.id, {
          id: uuidv4(),
          period: currentPeriod,
          secondsElapsed,
          playerId: currentOccupantId,
          positionAbbr: oldPosOfDraggedPlayer,
        }, getIdToken)
      } else {
        // The old spot is now empty — stamp bench for the occupant going off (if any)
      }
    }

    newPositions[positionAbbr] = playerId

    // Stamp the dragged player's new position
    createSubEventNonBlocking(match.id, {
      id: uuidv4(),
      period: currentPeriod,
      secondsElapsed,
      playerId,
      positionAbbr,
    }, getIdToken)

    return newPositions
  })
}
```

- [ ] **Step 3: Update handleBenchDrop to stamp a bench event**

Find `handleBenchDrop` (around line 213). Replace it with:

```typescript
const handleBenchDrop = (e: DragEvent<HTMLDivElement>) => {
  e.preventDefault()
  const playerId = e.dataTransfer.getData('playerId')
  if (!playerId) return

  updatePlayerTimes()

  const secondsElapsed = gameFormat
    ? gameFormat.periodDuration * 60 - time
    : 0

  setCourtPositions(prev => {
    const newPositions = { ...prev }
    const oldPosOfDraggedPlayer = Object.keys(newPositions).find(p => newPositions[p] === playerId)
    if (oldPosOfDraggedPlayer) {
      newPositions[oldPosOfDraggedPlayer] = null
      // Stamp bench event
      createSubEventNonBlocking(match.id, {
        id: uuidv4(),
        period: currentPeriod,
        secondsElapsed,
        playerId,
        positionAbbr: null,
      }, getIdToken)
    }
    return newPositions
  })
}
```

- [ ] **Step 4: Update advancePeriod to bulk-write the new starting lineup**

Find `advancePeriod` (around line 180). Replace it with:

```typescript
const advancePeriod = () => {
  if (!gameFormat || currentPeriod >= gameFormat.numberOfPeriods) return
  if (isActive) setIsActive(false)

  const nextPeriod = currentPeriod + 1

  // Write the current on-court players as the starting lineup for the new period
  const startingLineupEvents = Object.entries(courtPositions)
    .filter(([, playerId]) => playerId !== null)
    .map(([positionAbbr, playerId]) => ({
      id: uuidv4(),
      period: nextPeriod,
      secondsElapsed: 0,
      playerId: playerId!,
      positionAbbr,
    }))

  bulkCreateSubEventsNonBlocking(match.id, startingLineupEvents, getIdToken)

  setCurrentPeriod(nextPeriod)
  setTime(gameFormat.periodDuration * 60)
  lastUpdateTime.current = null
}
```

- [ ] **Step 5: Stamp starting lineup when game first loads (Period 1)**

Add a `useRef` to track whether the initial lineup has been stamped:

```typescript
const initialLineupStamped = useRef(false)
```

Add a `useEffect` that fires once when `courtPositions` is first populated and the game is not active:

```typescript
useEffect(() => {
  if (initialLineupStamped.current) return
  const hasPlayers = Object.values(courtPositions).some(Boolean)
  if (!hasPlayers) return

  initialLineupStamped.current = true
  const startingEvents = Object.entries(courtPositions)
    .filter(([, playerId]) => playerId !== null)
    .map(([positionAbbr, playerId]) => ({
      id: uuidv4(),
      period: 1,
      secondsElapsed: 0,
      playerId: playerId!,
      positionAbbr,
    }))

  if (startingEvents.length > 0) {
    bulkCreateSubEventsNonBlocking(match.id, startingEvents, getIdToken)
  }
}, [courtPositions, match.id, getIdToken])
```

- [ ] **Step 6: Verify the app builds**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/games/play/client.tsx
git commit -m "feat(live-game): stamp sub events on drag-drop and period advance"
```

---

## Task 11: SubEventPanel Component

**Files:**
- Create: `src/app/games/play/components/SubEventPanel.tsx`

- [ ] **Step 1: Create the components directory**

```bash
mkdir -p src/app/games/play/components
```

- [ ] **Step 2: Create SubEventPanel.tsx**

Create `src/app/games/play/components/SubEventPanel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { type SubEvent } from '@/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubEventPanelProps {
  currentPeriod: number
  numberOfPeriods: number
  subEvents: SubEvent[]
  players: Array<{ id: string; name: string }>
  positions: Array<{ abbreviation: string }>
  onCreate: (event: Omit<SubEvent, 'id' | 'matchId'>) => Promise<string | undefined>
  onUpdate: (id: string, changes: { secondsElapsed: number; positionAbbr: string | null }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

function secsToMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function mmssToSecs(value: string): number | null {
  const parts = value.split(':')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0], 10)
  const s = parseInt(parts[1], 10)
  if (isNaN(m) || isNaN(s) || s >= 60) return null
  return m * 60 + s
}

export default function SubEventPanel({
  currentPeriod,
  numberOfPeriods,
  subEvents,
  players,
  positions,
  onCreate,
  onUpdate,
  onRemove,
}: SubEventPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTimeValue, setEditTimeValue] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addPeriod, setAddPeriod] = useState(String(currentPeriod))
  const [addTime, setAddTime] = useState('00:00')
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addPosition, setAddPosition] = useState('bench')

  const periodEvents = subEvents
    .filter(e => e.period === currentPeriod)
    .sort((a, b) => a.secondsElapsed - b.secondsElapsed)

  function handleEditStart(event: SubEvent) {
    setEditingId(event.id)
    setEditTimeValue(secsToMMSS(event.secondsElapsed))
  }

  async function handleEditSave(event: SubEvent) {
    const secs = mmssToSecs(editTimeValue)
    if (secs === null) { setEditingId(null); return }
    await onUpdate(event.id, { secondsElapsed: secs, positionAbbr: event.positionAbbr })
    setEditingId(null)
  }

  async function handleAdd() {
    const secs = mmssToSecs(addTime)
    if (secs === null || !addPlayerId) return
    await onCreate({
      period: parseInt(addPeriod, 10),
      secondsElapsed: secs,
      playerId: addPlayerId,
      positionAbbr: addPosition === 'bench' ? null : addPosition,
    })
    setShowAddForm(false)
    setAddTime('00:00')
    setAddPlayerId('')
    setAddPosition('bench')
  }

  return (
    <Card className="mt-4">
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Q{currentPeriod} Substitutions ({periodEvents.length})
          </CardTitle>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0 space-y-2">
          {periodEvents.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No substitutions recorded for this period yet.
            </p>
          )}

          {periodEvents.map(event => {
            const player = players.find(p => p.id === event.playerId)
            const posLabel = event.positionAbbr ?? 'bench'
            return (
              <div key={event.id} className="flex items-center gap-2 text-sm rounded-md border px-3 py-2">
                {/* Time — editable inline */}
                {editingId === event.id ? (
                  <Input
                    className="w-20 h-7 font-mono text-xs"
                    value={editTimeValue}
                    onChange={e => setEditTimeValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEditSave(event) }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="font-mono text-xs w-12 cursor-pointer hover:text-primary"
                    onClick={() => handleEditStart(event)}
                    title="Click to edit time"
                  >
                    {secsToMMSS(event.secondsElapsed)}
                  </span>
                )}

                <span className="flex-1 truncate">{player?.name ?? event.playerId}</span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className="font-semibold text-xs w-10">{posLabel}</span>

                {/* Actions */}
                {editingId === event.id ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditSave(event)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEditStart(event)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onRemove(event.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            )
          })}

          {/* Add substitution form */}
          {showAddForm ? (
            <div className="border rounded-md p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Period</label>
                  <Select value={addPeriod} onValueChange={setAddPeriod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: numberOfPeriods }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>Q{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time (MM:SS)</label>
                  <Input
                    className="h-8 text-xs font-mono"
                    value={addTime}
                    onChange={e => setAddTime(e.target.value)}
                    placeholder="04:30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Player</label>
                  <Select value={addPlayerId} onValueChange={setAddPlayerId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {players.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Position</label>
                  <Select value={addPosition} onValueChange={setAddPosition}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bench">Bench</SelectItem>
                      {positions.map(pos => (
                        <SelectItem key={pos.abbreviation} value={pos.abbreviation}>{pos.abbreviation}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!addPlayerId}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={() => { setAddPeriod(String(currentPeriod)); setShowAddForm(true) }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add substitution
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/games/play/components/SubEventPanel.tsx
git commit -m "feat: add SubEventPanel component for editing sub events"
```

---

## Task 12: Wire SubEventPanel into LiveGameTracker

**Files:**
- Modify: `src/app/games/play/client.tsx`

The `LiveGameTracker` component needs the `useSubEvents` hook and the `SubEventPanel` rendered below the court columns.

- [ ] **Step 1: Import SubEventPanel and useSubEvents in client.tsx**

Add to the imports at the top of `src/app/games/play/client.tsx`:

```typescript
import SubEventPanel from './components/SubEventPanel'
import { useSubEvents } from '@/api/hooks/use-sub-events'
```

- [ ] **Step 2: Add useSubEvents inside LiveGameTracker**

Inside `LiveGameTracker`, after the existing state declarations, add:

```typescript
const { data: subEvents, create: createSubEvent, update: updateSubEvent, remove: removeSubEvent } = useSubEvents(match.id)
```

- [ ] **Step 3: Render SubEventPanel below the two-column layout**

Find the closing `</div>` of the `flex flex-col md:flex-row` wrapper (around line 430, after the bench card). Add the `SubEventPanel` after it:

```typescript
      {/* ── Sub Event Panel ─────────────────────────────────── */}
      {subEvents && (
        <SubEventPanel
          currentPeriod={currentPeriod}
          numberOfPeriods={gameFormat?.numberOfPeriods ?? 4}
          subEvents={subEvents}
          players={players}
          positions={positions}
          onCreate={createSubEvent}
          onUpdate={updateSubEvent}
          onRemove={removeSubEvent}
        />
      )}
```

- [ ] **Step 4: Verify the app builds**

```bash
npm run build
```

Expected: Build succeeds. The Sub Event Panel should now appear below the live game court.

- [ ] **Step 5: Commit**

```bash
git add src/app/games/play/client.tsx
git commit -m "feat(live-game): wire SubEventPanel below the court"
```

---

## Task 13: MatchPlanEditor — Replace MatchPlanner

**Files:**
- Create: `src/app/games/play/components/MatchPlanEditor.tsx`
- Modify: `src/app/games/play/client.tsx`

The existing `MatchPlanner` component uses `match_plans` (whole-period snapshots). `MatchPlanEditor` replaces it with a per-period editor backed by `useSubEvents`.

- [ ] **Step 1: Create MatchPlanEditor.tsx**

Create `src/app/games/play/components/MatchPlanEditor.tsx`:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useSubEvents } from '@/api/hooks/use-sub-events'
import { type SubEvent } from '@/api/types'
import SubEventPanel from './SubEventPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Users, Copy } from 'lucide-react'

// Reuse the same court slot map from client.tsx
const NETBALL_COURT_SLOTS: Record<string, { x: number; y: number }> = {
  GS: { x: 50, y: 15 }, GA: { x: 23.4, y: 27 }, WA: { x: 76.6, y: 40 },
  C:  { x: 50, y: 50 }, WD: { x: 23.4, y: 60 }, GD: { x: 76.6, y: 73 },
  GK: { x: 50, y: 85 },
}

interface MatchPlanEditorProps {
  match: any
  gameFormat: any
  positions: any[]
  players: any[]
}

export default function MatchPlanEditor({ match, gameFormat, positions, players }: MatchPlanEditorProps) {
  const { data: subEvents, isLoading, create, update, remove, bulkCreate } = useSubEvents(match.id)
  const [activePeriod, setActivePeriod] = useState(1)
  const [isDragging, setIsDragging] = useState(false)

  const periods = Array.from({ length: gameFormat?.numberOfPeriods ?? 4 }, (_, i) => i + 1)
  const periodDurationSecs = (gameFormat?.periodDuration ?? 0) * 60

  // Build a map: period → positionAbbr → playerId for the starting lineup (secondsElapsed = 0)
  const startingLineups = useMemo(() => {
    if (!subEvents) return {}
    const lineups: Record<number, Record<string, string>> = {}
    for (const period of periods) {
      lineups[period] = {}
    }
    for (const e of subEvents) {
      if (e.secondsElapsed === 0 && e.positionAbbr !== null) {
        lineups[e.period] = lineups[e.period] ?? {}
        lineups[e.period][e.positionAbbr] = e.playerId
      }
    }
    return lineups
  }, [subEvents, periods])

  const currentLineup = startingLineups[activePeriod] ?? {}

  const benchedPlayers = players.filter(p =>
    !Object.values(currentLineup).includes(p.id)
  )

  function handleDrop(e: React.DragEvent<HTMLDivElement>, positionAbbr: string) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId || !subEvents) return

    // Remove any existing starting-lineup event for this player in this period
    const existingForPlayer = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId
    )
    // Remove existing occupant of this position
    const existingForPosition = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.positionAbbr === positionAbbr
    )

    const toRemove = [existingForPlayer?.id, existingForPosition?.id].filter(Boolean) as string[]
    Promise.all(toRemove.map(id => remove(id))).then(() => {
      create({ period: activePeriod, secondsElapsed: 0, playerId, positionAbbr })
    })
  }

  function handleBenchDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId || !subEvents) return
    const existing = subEvents.find(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0 && ev.playerId === playerId
    )
    if (existing) remove(existing.id)
  }

  const copyFromPrevious = () => {
    if (activePeriod <= 1 || !subEvents) return
    const prevLineup = startingLineups[activePeriod - 1] ?? {}
    // Remove existing starting lineup for this period
    const existingForPeriod = subEvents.filter(
      ev => ev.period === activePeriod && ev.secondsElapsed === 0
    )
    Promise.all(existingForPeriod.map(ev => remove(ev.id))).then(() => {
      bulkCreate(
        Object.entries(prevLineup).map(([positionAbbr, playerId]) => ({
          period: activePeriod,
          secondsElapsed: 0,
          playerId,
          positionAbbr,
        }))
      )
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const useCourtLayout = positions?.length === 7 &&
    positions.every(p => p.abbreviation in NETBALL_COURT_SLOTS)

  return (
    <div className="space-y-6">
      <Tabs value={String(activePeriod)} onValueChange={v => setActivePeriod(Number(v))}>
        <TabsList>
          {periods.map(p => (
            <TabsTrigger key={p} value={String(p)}>Q{p}</TabsTrigger>
          ))}
        </TabsList>

        {periods.map(period => (
          <TabsContent key={period} value={String(period)} className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Q{period} Starting Lineup</CardTitle>
                  <CardDescription>Drag players onto the court positions.</CardDescription>
                </div>
                {period > 1 && (
                  <Button size="sm" variant="outline" onClick={copyFromPrevious}>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Q{period - 1}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Court */}
                  <div className="flex-1">
                    {useCourtLayout ? (
                      <div className="relative rounded-lg overflow-hidden w-full" style={{ aspectRatio: '2/3' }}>
                        <svg viewBox="0 0 400 800" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                          <rect width="400" height="800" fill="#1e6b38" rx="6" />
                          <rect x="10" y="10" width="380" height="780" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <line x1="10" y1="270" x2="390" y2="270" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <line x1="10" y1="530" x2="390" y2="530" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                          <circle cx="200" cy="400" r="22" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" />
                        </svg>
                        {positions.map(position => {
                          const slot = NETBALL_COURT_SLOTS[position.abbreviation]
                          if (!slot) return null
                          const occupantId = currentLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              draggable={!!player}
                              onDragStart={player ? e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) } : undefined}
                              onDragEnd={() => setIsDragging(false)}
                              onDrop={e => handleDrop(e, position.abbreviation)}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              style={{
                                position: 'absolute',
                                left: `${slot.x}%`,
                                top: `${slot.y}%`,
                                transform: 'translate(-50%, -50%)',
                                width: '140px',
                                height: '56px',
                              }}
                              className={cn(
                                'rounded-full border-2 flex flex-col items-center justify-center text-center transition-all z-10 select-none px-2',
                                player
                                  ? 'border-primary bg-primary text-primary-foreground shadow-lg cursor-grab'
                                  : isDragging
                                    ? 'border-yellow-300/70 bg-black/40 border-dashed'
                                    : 'border-white/50 bg-black/25 border-dashed'
                              )}
                            >
                              {player ? (
                                <span className="text-[12px] font-bold truncate w-full text-center">
                                  {player.name.split(' ')[0]}
                                </span>
                              ) : (
                                <span className="text-white/80 text-sm font-bold">{position.abbreviation}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {positions.map(position => {
                          const occupantId = currentLineup[position.abbreviation]
                          const player = players.find(p => p.id === occupantId)
                          return (
                            <div
                              key={position.id}
                              onDrop={e => handleDrop(e, position.abbreviation)}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                              className={cn(
                                'p-3 rounded-lg border-2 border-dashed flex items-center gap-2 min-h-[60px]',
                                player ? 'border-primary bg-primary/10' : 'border-muted-foreground/40'
                              )}
                            >
                              <span className="font-bold text-xs text-primary w-8">{position.abbreviation}</span>
                              {player ? (
                                <span
                                  draggable
                                  onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                                  onDragEnd={() => setIsDragging(false)}
                                  className="text-sm cursor-grab"
                                >
                                  {player.name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Empty</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bench */}
                  <div
                    className={cn(
                      'w-full md:w-48 rounded-lg border-2 border-dashed p-3 transition-colors min-h-[120px]',
                      isDragging ? 'border-primary/70 bg-primary/5' : 'border-muted-foreground/40'
                    )}
                    onDrop={handleBenchDrop}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Bench ({benchedPlayers.length})</span>
                    </div>
                    {benchedPlayers.map(player => (
                      <div
                        key={player.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('playerId', player.id); setIsDragging(true) }}
                        onDragEnd={() => setIsDragging(false)}
                        className="text-sm py-1 px-2 rounded cursor-grab hover:bg-muted"
                      >
                        {player.name}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Substitutions for this period */}
            {subEvents && (
              <SubEventPanel
                currentPeriod={period}
                numberOfPeriods={gameFormat?.numberOfPeriods ?? 4}
                subEvents={subEvents.filter(e => e.secondsElapsed > 0)}
                players={players}
                positions={positions}
                onCreate={create}
                onUpdate={update}
                onRemove={remove}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Replace MatchPlanner with MatchPlanEditor in client.tsx**

In `src/app/games/play/client.tsx`, add the import:

```typescript
import MatchPlanEditor from './components/MatchPlanEditor'
```

Find the block where `MatchPlanner` is used in the default export (the section that renders based on `?mode=plan`). It will look something like:

```typescript
return <MatchPlanner match={match} gameFormat={gameFormat} positions={positions} players={players} matchPlans={matchPlans ?? []} />
```

Replace it with:

```typescript
return <MatchPlanEditor match={match} gameFormat={gameFormat} positions={positions} players={players} />
```

You can now also remove the `useMatchPlans` import and call for plan mode — `MatchPlanEditor` fetches its own data via `useSubEvents`.

- [ ] **Step 3: Verify the app builds**

```bash
npm run build
```

Expected: No TypeScript errors. If unused imports appear (e.g. `useMatchPlans`, `upsertMatchPlanNonBlocking` from plan mode), remove them.

- [ ] **Step 4: Commit**

```bash
git add src/app/games/play/components/MatchPlanEditor.tsx src/app/games/play/client.tsx
git commit -m "feat: add MatchPlanEditor with period tabs, drag-drop lineup, and sub event panel"
```

---

## Task 14: Tournament View — Use calculatePlayerTimes

**Files:**
- Modify: `src/app/tournaments/view/client.tsx`

Replace the existing `calculateMatchTimes()` function and the `apiJSON` plan-fetching with the shared utility and sub events.

- [ ] **Step 1: Update imports**

In `src/app/tournaments/view/client.tsx`, replace:

```typescript
import { normalizeMatchPlan } from '@/api/types'
```

with:

```typescript
import { normalizeSubEvent } from '@/api/types'
import { calculatePlayerTimes, groupPositionTimes } from '@/lib/time-calculations'
```

- [ ] **Step 2: Remove the calculateMatchTimes function**

Delete the entire `calculateMatchTimes` function (lines 33–55 in the current file). It is replaced by `calculatePlayerTimes` from the shared utility.

- [ ] **Step 3: Rename state from allMatchPlans to allSubEvents**

Replace the state declaration:

```typescript
const [allMatchPlans, setAllMatchPlans] = useState<any[]>([])
const [arePlansLoading, setArePlansLoading] = useState(false)
```

with:

```typescript
const [allSubEvents, setAllSubEvents] = useState<any[]>([])
const [areSubEventsLoading, setAreSubEventsLoading] = useState(false)
```

- [ ] **Step 4: Update the useEffect that fetches match data**

Replace the existing `useEffect` that calls `/plans`:

```typescript
useEffect(() => {
  if (matches.length === 0) return
  setAreSubEventsLoading(true)
  Promise.all(matches.map(m => apiJSON<any[]>(`/api/matches/${m.id}/sub-events`, getIdToken)))
    .then(results => setAllSubEvents(results.flat().map(normalizeSubEvent)))
    .catch(() => setAllSubEvents([]))
    .finally(() => setAreSubEventsLoading(false))
}, [matches, getIdToken])
```

- [ ] **Step 5: Update tournamentTimeTotals to use calculatePlayerTimes**

Replace the existing `tournamentTimeTotals` useMemo:

```typescript
const tournamentTimeTotals = useMemo(() => {
  if (!players.length || !matches.length || !allGameFormats) return {}

  const tournamentTotals: Record<string, { total: number; positions: Record<string, number> }> =
    players.reduce((acc: any, p: any) => ({ ...acc, [p.id]: { total: 0, positions: {} } }), {})

  matches.forEach((match: any) => {
    const gameFormat = allGameFormats.find(f => f.id === match.gameFormatId)
    if (!gameFormat) return
    const matchEvents = allSubEvents.filter(e => e.matchId === match.id)
    const matchTimes = calculatePlayerTimes(matchEvents, gameFormat.periodDuration * 60)
    Object.entries(matchTimes).forEach(([playerId, timeInfo]) => {
      if (tournamentTotals[playerId]) {
        tournamentTotals[playerId].total += timeInfo.total
        Object.entries(timeInfo.positions).forEach(([pos, time]) => {
          tournamentTotals[playerId].positions[pos] =
            (tournamentTotals[playerId].positions[pos] || 0) + (time as number)
        })
      }
    })
  })
  return tournamentTotals
}, [players, matches, allGameFormats, allSubEvents])
```

- [ ] **Step 6: Build a positionGroups map for 6-aside and update per-match table rendering**

Add a `positionGroups` derived value from `primaryGameFormat`:

```typescript
const positionGroups: Record<string, string | null> = useMemo(() =>
  (positions ?? []).reduce((acc, p) => ({ ...acc, [p.abbreviation]: p.positionGroup ?? null }), {}),
  [positions]
)
```

In the tournament summary table and per-match tables, wrap position cell values with `groupPositionTimes` where needed. Since `calculatePlayerTimes` returns raw position keys (e.g. `A1`, `A2`), apply grouping when rendering:

Replace this pattern in both tables:
```typescript
{formatTime(tournamentTimeTotals[player.id]?.positions[p.abbreviation] || 0)}
```
with:
```typescript
{formatTime(groupPositionTimes(tournamentTimeTotals[player.id]?.positions ?? {}, positionGroups)[p.positionGroup ?? p.abbreviation] || 0)}
```

And for the per-match `matchTimes`, compute them locally:
```typescript
const matchTimes = calculatePlayerTimes(
  allSubEvents.filter(e => e.matchId === match.id),
  (allGameFormats?.find(f => f.id === match.gameFormatId)?.periodDuration ?? 0) * 60
)
```

- [ ] **Step 7: Update isLoading flag**

Replace `arePlansLoading` with `areSubEventsLoading` in the `isLoading` constant.

- [ ] **Step 8: Verify typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/tournaments/view/client.tsx
git commit -m "feat(tournament): use calculatePlayerTimes from sub_events"
```

---

## Task 15: Run Migration + Verify

This task runs the one-time migration of `match_plans` → `sub_events` in production.

- [ ] **Step 1: Confirm the migration secret**

You set this in Task 5, Step 4. Retrieve it from your password manager or re-generate with:

```bash
openssl rand -hex 32
```

If you need to reset it: `cd worker && npx wrangler secret put MIGRATION_SECRET`

- [ ] **Step 2: Check how many match_plans exist before migration**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --remote --command "SELECT COUNT(*) as count FROM match_plans"
```

Note the count.

- [ ] **Step 3: Run migration**

```bash
curl -X POST \
  -H "X-Migration-Secret: YOUR_SECRET_HERE" \
  https://netball-roster-tracker.forgesync.workers.dev/migrate/match-plans
```

Expected response:
```json
{ "plans": N, "migrated": M, "skipped": 0 }
```

Where `N` = number of match_plans rows and `M` = total player-position entries migrated.

- [ ] **Step 4: Verify sub_events were created**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --remote --command "SELECT COUNT(*) as count FROM sub_events"
```

Expected: count ≥ `M` from the migration response.

- [ ] **Step 5: Spot-check a specific match's sub events**

```bash
cd worker && npx wrangler d1 execute netball-roster-tracker-db --remote --command "SELECT * FROM sub_events LIMIT 10"
```

Expected: Rows with `seconds_elapsed = 0` and valid `player_id` / `position_abbr` values.

- [ ] **Step 6: No commit needed** — this task is a production operation, not a code change.

---

## Task 16: Deprecate match_plans

Only run this task after Task 15 is verified complete and the app is running correctly on sub_events.

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `src/firebase/non-blocking-updates.tsx`

- [ ] **Step 1: Remove match_plans routes from worker/src/index.ts**

Remove these lines from `worker/src/index.ts`:

```typescript
import matchPlans from './routes/match-plans'
// ...
app.route('/api/matches/:matchId/plans', matchPlans)
app.route('/api/match-plans', matchPlans)
```

- [ ] **Step 2: Remove upsertMatchPlanNonBlocking from non-blocking-updates.tsx**

Delete the `upsertMatchPlanNonBlocking` function from `src/firebase/non-blocking-updates.tsx`.

- [ ] **Step 3: Remove useMatchPlans and useMatchPlansMultiple imports from client.tsx**

Check `src/app/games/play/client.tsx` for any remaining imports of `useMatchPlans` or `useMatchPlansMultiple` and remove them if no longer referenced.

- [ ] **Step 4: Typecheck to catch any remaining references**

```bash
npm run typecheck
```

Fix any remaining references to `match_plans`, `useMatchPlans`, `upsertMatchPlanNonBlocking`, or `normalizeMatchPlan` if they appear.

- [ ] **Step 5: Build and deploy**

```bash
npm run build && cd worker && npx wrangler deploy
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd .. && git add worker/src/index.ts src/firebase/non-blocking-updates.tsx src/app/games/play/client.tsx
git commit -m "chore: deprecate match_plans routes and non-blocking functions"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `sub_events` schema (Task 2)
- ✅ Migration endpoint with secret auth (Task 5)
- ✅ Backend API routes: GET, POST, PUT, DELETE, bulk (Task 4)
- ✅ `calculatePlayerTimes()` pure function with tests (Task 3)
- ✅ `groupPositionTimes()` for 6-aside (Task 3)
- ✅ `normalizeSubEvent()` and `SubEvent` interface (Task 6)
- ✅ `useSubEvents` hook (Task 7)
- ✅ Non-blocking write functions (Task 8)
- ✅ Editable timer for time recovery (Task 9)
- ✅ Sub stamping on drag-drop (Task 10)
- ✅ Starting lineup bulk-write on period advance (Task 10)
- ✅ SubEventPanel: edit time, delete, add sub (Task 11–12)
- ✅ MatchPlanEditor: period tabs, starting lineup, copy from previous, subs section (Task 13)
- ✅ Tournament view recalculated from sub_events (Task 14)
- ✅ Migration run + verification (Task 15)
- ✅ Deprecate match_plans (Task 16)
- ✅ `Position.positionGroup` + 6-aside grouping utility built now to avoid later refactor (Tasks 3, 6, 14)
- ✅ "Copy from previous period" disabled for Q1 (Task 13 — `period > 1` guard)
- ✅ `seconds_elapsed` stored as count-up, countdown display kept (Tasks 10, 11)
- ✅ `ON DELETE CASCADE` on sub_events FK (Task 2)
