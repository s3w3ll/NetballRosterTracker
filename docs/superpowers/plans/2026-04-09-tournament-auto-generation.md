# Tournament Auto-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When creating a tournament, let the user optionally generate N games with auto-balanced match plans so every player gets equal court time and position/zone rotation across the whole tournament.

**Architecture:** A greedy scoring algorithm runs entirely server-side in the Cloudflare Worker, computing all match plans in one pass and writing them atomically via D1 `batch()`. The frontend adds conditional fields to the tournament creation form and a red→green court-time gradient to the tournament view page.

**Tech Stack:** Hono (Worker router), D1 `batch()` (atomic insert), Zod + react-hook-form (frontend form), `useMatchPlansMultiple` hook (existing), vitest (tests), uuid (Worker-side IDs)

**Spec:** `docs/superpowers/specs/2026-04-09-tournament-auto-generation-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `worker/src/lib/scheduler.ts` | **Create** | Pure greedy scheduling algorithm — no D1/Hono deps |
| `src/lib/scheduler.test.ts` | **Create** | Vitest tests for the scheduler (imports via relative path) |
| `worker/src/index.ts` | **Modify** | Mount the missing match-plans route |
| `worker/src/routes/tournaments.ts` | **Modify** | Add `POST /:id/generate` endpoint |
| `src/app/tournaments/new/page.tsx` | **Modify** | Add optional numberOfGames + roster + format fields |
| `src/app/tournaments/view/client.tsx` | **Modify** | Add match plan period counts + red→green gradient |

---

## Task 1: Greedy Scheduling Algorithm

**Files:**
- Create: `worker/src/lib/scheduler.ts`

- [ ] **Step 1.1 — Create the scheduler module**

Create `worker/src/lib/scheduler.ts` with the following content:

```typescript
const W_COURT = 10
const W_ZONE = 3
const W_POSITION = 1

export interface SchedulerPlayer {
  id: string
}

export interface SchedulerPosition {
  abbreviation: string
  positionGroup: string | null
}

export interface GeneratedPeriodPlan {
  matchIndex: number  // 0-based
  quarter: number     // 1-based
  playerPositions: Array<{ position: string; playerId: string }>
}

export function generateTournamentPlans(
  players: SchedulerPlayer[],
  positions: SchedulerPosition[],
  numberOfPeriods: number,
  numberOfGames: number
): GeneratedPeriodPlan[] {
  if (players.length === 0 || positions.length === 0) return []

  // Per-player running totals — never reset between games
  const courtPeriods: Record<string, number> = {}
  const positionCounts: Record<string, Record<string, number>> = {}
  const zoneCounts: Record<string, Record<string, number>> = {}

  for (const p of players) {
    courtPeriods[p.id] = 0
    positionCounts[p.id] = {}
    zoneCounts[p.id] = {}
    for (const pos of positions) {
      positionCounts[p.id][pos.abbreviation] = 0
      const zoneKey = pos.positionGroup ?? pos.abbreviation
      zoneCounts[p.id][zoneKey] = 0
    }
  }

  const plans: GeneratedPeriodPlan[] = []

  for (let gameIdx = 0; gameIdx < numberOfGames; gameIdx++) {
    for (let period = 1; period <= numberOfPeriods; period++) {
      const assignedThisPeriod = new Set<string>()
      const playerPositions: Array<{ position: string; playerId: string }> = []

      for (const pos of positions) {
        const zoneKey = pos.positionGroup ?? pos.abbreviation
        const n = players.length

        const avgCourt = players.reduce((s, p) => s + courtPeriods[p.id], 0) / n
        const avgZone = players.reduce((s, p) => s + (zoneCounts[p.id][zoneKey] ?? 0), 0) / n
        const avgPos = players.reduce((s, p) => s + (positionCounts[p.id][pos.abbreviation] ?? 0), 0) / n

        let best: SchedulerPlayer | null = null
        let bestScore = -Infinity

        for (const player of players) {
          if (assignedThisPeriod.has(player.id)) continue
          const score =
            (avgCourt - courtPeriods[player.id]) * W_COURT +
            (avgZone - (zoneCounts[player.id][zoneKey] ?? 0)) * W_ZONE +
            (avgPos - (positionCounts[player.id][pos.abbreviation] ?? 0)) * W_POSITION
          if (score > bestScore) {
            bestScore = score
            best = player
          }
        }

        if (!best) break  // fewer players than positions — stop this period

        assignedThisPeriod.add(best.id)
        playerPositions.push({ position: pos.abbreviation, playerId: best.id })
        courtPeriods[best.id]++
        positionCounts[best.id][pos.abbreviation]++
        zoneCounts[best.id][zoneKey] = (zoneCounts[best.id][zoneKey] ?? 0) + 1
      }

      plans.push({ matchIndex: gameIdx, quarter: period, playerPositions })
    }
  }

  return plans
}
```

- [ ] **Step 1.2 — Write failing tests**

Create `src/lib/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateTournamentPlans } from '../../worker/src/lib/scheduler'

const sevenAside = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'].map(a => ({
  abbreviation: a,
  positionGroup: null,
}))

const sixAside = [
  { abbreviation: 'A1', positionGroup: 'A' },
  { abbreviation: 'A2', positionGroup: 'A' },
  { abbreviation: 'C1', positionGroup: 'C' },
  { abbreviation: 'C2', positionGroup: 'C' },
  { abbreviation: 'D1', positionGroup: 'D' },
  { abbreviation: 'D2', positionGroup: 'D' },
]

const makePlayers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))

describe('generateTournamentPlans', () => {
  it('returns empty array when players list is empty', () => {
    expect(generateTournamentPlans([], sevenAside, 4, 3)).toEqual([])
  })

  it('returns empty array when positions list is empty', () => {
    expect(generateTournamentPlans(makePlayers(10), [], 4, 3)).toEqual([])
  })

  it('generates the correct total number of period plans', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 3)
    expect(plans).toHaveLength(12) // 4 periods × 3 games
  })

  it('each period plan has exactly teamSize assignments when players >= teamSize', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 2)
    for (const plan of plans) {
      expect(plan.playerPositions).toHaveLength(7)
    }
  })

  it('no player appears twice in the same period', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 3)
    for (const plan of plans) {
      const ids = plan.playerPositions.map(pp => pp.playerId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('period quarter is 1-based and matchIndex is 0-based', () => {
    const plans = generateTournamentPlans(makePlayers(8), sevenAside, 4, 2)
    const game0 = plans.filter(p => p.matchIndex === 0)
    const game1 = plans.filter(p => p.matchIndex === 1)
    expect(game0.map(p => p.quarter)).toEqual([1, 2, 3, 4])
    expect(game1.map(p => p.quarter)).toEqual([1, 2, 3, 4])
  })

  it('balances court time: max diff between players is at most 2 periods over 5 games', () => {
    const players = makePlayers(10)
    const plans = generateTournamentPlans(players, sevenAside, 4, 5)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    const values = Object.values(counts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2)
  })

  it('when players == teamSize every player plays every period', () => {
    const players = makePlayers(7)
    const plans = generateTournamentPlans(players, sevenAside, 4, 2)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    for (const v of Object.values(counts)) {
      expect(v).toBe(8) // 4 periods × 2 games
    }
  })

  it('handles fewer players than teamSize by filling only available slots', () => {
    const plans = generateTournamentPlans(makePlayers(3), sevenAside, 2, 1)
    expect(plans[0].playerPositions).toHaveLength(3)
    expect(plans[1].playerPositions).toHaveLength(3)
  })

  it('balances zone time in 6-aside: max zone-A diff <= 3 over 6 games with 9 players', () => {
    const players = makePlayers(9)
    const plans = generateTournamentPlans(players, sixAside, 4, 6)
    const aZoneCounts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        const pos = sixAside.find(p => p.abbreviation === pp.position)!
        if (pos.positionGroup === 'A') {
          aZoneCounts[pp.playerId] = (aZoneCounts[pp.playerId] ?? 0) + 1
        }
      }
    }
    const values = Object.values(aZoneCounts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3)
  })

  it('carries court time deficit across games (state persists)', () => {
    // With 8 players and 7 positions over 2 games × 4 periods:
    // One player benched each period. Across 8 periods total, each should sit exactly once.
    const players = makePlayers(8)
    const plans = generateTournamentPlans(players, sevenAside, 4, 2)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    // Each player should play 7 periods out of 8 (one bench slot)
    for (const v of Object.values(counts)) {
      expect(v).toBe(7)
    }
  })
})
```

- [ ] **Step 1.3 — Run tests to verify they fail (scheduler not found)**

```bash
npm test -- src/lib/scheduler.test.ts
```

Expected: `Error: Cannot find module '../../worker/src/lib/scheduler'`

- [ ] **Step 1.4 — Run tests again to verify they pass**

```bash
npm test -- src/lib/scheduler.test.ts
```

Expected: All 10 tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add worker/src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(scheduler): greedy tournament plan generation algorithm with tests"
```

---

## Task 2: Mount Match-Plans Route + Generate Endpoint

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/src/routes/tournaments.ts`

> **Note:** `worker/src/routes/match-plans.ts` already exists but is not mounted in `index.ts`. This is a missing registration.

- [ ] **Step 2.1 — Mount the match-plans route in `worker/src/index.ts`**

Add the import and route registration. The full updated import block and routes section should be:

```typescript
import matchPlans from './routes/match-plans'
```

Add after line `app.route('/api/matches/:matchId/sub-events', subEvents)`:

```typescript
app.route('/api/matches/:matchId/plans', matchPlans)
```

The routes section should now read:

```typescript
app.route('/api/rosters', rosters)
app.route('/api/rosters/:rosterId/players', players)
app.route('/api/players', players)
app.route('/api/game-formats', gameFormats)
app.route('/api/positions', positions)
app.route('/api/matches', matches)
app.route('/api/matches/:matchId/sub-events', subEvents)
app.route('/api/matches/:matchId/plans', matchPlans)
app.route('/api/tournaments', tournaments)
```

- [ ] **Step 2.2 — Add the generate endpoint to `worker/src/routes/tournaments.ts`**

Add imports at the top of `worker/src/routes/tournaments.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid'
import { generateTournamentPlans } from '../lib/scheduler'
```

Add the following route **before** `export default tournaments` at the bottom of the file:

```typescript
// POST /api/tournaments/:id/generate
tournaments.post('/:id/generate', async (c) => {
  const userId = c.get('userId')
  const { id: tournamentId } = c.req.param()
  const body = await c.req.json<{
    rosterId: string
    gameFormatId: string
    numberOfGames: number
  }>()

  // Verify tournament ownership
  const tournament = await c.env.DB.prepare(
    'SELECT id FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(tournamentId, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  // Fetch players for the roster
  const playersResult = await c.env.DB.prepare(
    'SELECT id FROM players WHERE roster_id = ?'
  ).bind(body.rosterId).all()
  const players = playersResult.results as Array<{ id: string }>

  // Fetch game format (to get number_of_periods)
  const gameFormat = await c.env.DB.prepare(
    'SELECT number_of_periods FROM game_formats WHERE id = ? AND user_id = ?'
  ).bind(body.gameFormatId, userId).first() as { number_of_periods: number } | null
  if (!gameFormat) return c.json({ error: 'Game format not found' }, 404)

  // Fetch positions for the game format (ordered by rowid to preserve display order)
  const positionsResult = await c.env.DB.prepare(
    'SELECT abbreviation, position_group FROM positions WHERE game_format_id = ? ORDER BY rowid'
  ).bind(body.gameFormatId).all()
  const positions = (positionsResult.results as Array<{ abbreviation: string; position_group: string | null }>)
    .map(p => ({ abbreviation: p.abbreviation, positionGroup: p.position_group }))

  // Generate all period plans via greedy scheduler
  const plans = generateTournamentPlans(players, positions, gameFormat.number_of_periods, body.numberOfGames)

  // Pre-generate all match IDs
  const matchIds: string[] = Array.from({ length: body.numberOfGames }, () => uuidv4())
  const now = new Date().toISOString()

  // Build atomic batch: matches + tournament links + match plans
  const stmts = [
    ...matchIds.map((matchId, i) =>
      c.env.DB.prepare(
        'INSERT INTO matches (id, user_id, name, team1_roster_id, game_format_id, start_time) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(matchId, userId, `Game ${i + 1}`, body.rosterId, body.gameFormatId, now)
    ),
    ...matchIds.map((matchId) =>
      c.env.DB.prepare(
        'INSERT INTO tournament_matches (tournament_id, match_id) VALUES (?, ?)'
      ).bind(tournamentId, matchId)
    ),
    ...plans.map((plan) =>
      c.env.DB.prepare(
        'INSERT INTO match_plans (id, match_id, user_id, quarter, player_positions) VALUES (?, ?, ?, ?, ?)'
      ).bind(uuidv4(), matchIds[plan.matchIndex], userId, plan.quarter, JSON.stringify(plan.playerPositions))
    ),
  ]

  await c.env.DB.batch(stmts)

  return c.json({ matchIds }, 201)
})
```

- [ ] **Step 2.3 — Verify TypeScript compiles**

```bash
cd worker && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2.4 — Commit**

```bash
git add worker/src/index.ts worker/src/routes/tournaments.ts
git commit -m "feat(worker): add generate endpoint and mount match-plans route"
```

---

## Task 3: Tournament Creation Form — Optional Game Generation

**Files:**
- Modify: `src/app/tournaments/new/page.tsx`

- [ ] **Step 3.1 — Replace `src/app/tournaments/new/page.tsx`**

Replace the entire file with:

```tsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { apiJSON } from '@/api/client';
import { setNavId } from '@/lib/nav';
import { useRosters } from '@/api/hooks/use-rosters';
import { useGameFormats } from '@/api/hooks/use-game-formats';

const tournamentSchema = z.object({
  name: z.string().min(1, "Tournament name is required."),
  numberOfGames: z.string().optional(),
  rosterId: z.string().optional(),
  gameFormatId: z.string().optional(),
}).superRefine((data, ctx) => {
  const n = data.numberOfGames ? Number(data.numberOfGames) : NaN
  if (!isNaN(n) && n > 0) {
    if (!data.rosterId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rosterId'], message: 'Please select a roster.' })
    }
    if (!data.gameFormatId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gameFormatId'], message: 'Please select a game format.' })
    }
  }
})

type TournamentFormData = z.infer<typeof tournamentSchema>;

export default function NewTournamentPage() {
  const { getIdToken } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const { data: rosters } = useRosters();
  const { data: gameFormats } = useGameFormats();

  const form = useForm<TournamentFormData>({
    resolver: zodResolver(tournamentSchema),
    defaultValues: { name: '', numberOfGames: '', rosterId: undefined, gameFormatId: undefined },
  });

  const numberOfGames = form.watch('numberOfGames');
  const isGenerating = Boolean(numberOfGames && Number(numberOfGames) > 0);

  const onSubmit = async (data: TournamentFormData) => {
    try {
      const tournamentId = uuidv4();

      await apiJSON('/api/tournaments', getIdToken, {
        method: 'POST',
        body: JSON.stringify({ id: tournamentId, name: data.name }),
      });

      const n = data.numberOfGames ? parseInt(data.numberOfGames, 10) : NaN;
      if (!isNaN(n) && n > 0 && data.rosterId && data.gameFormatId) {
        await apiJSON(`/api/tournaments/${tournamentId}/generate`, getIdToken, {
          method: 'POST',
          body: JSON.stringify({
            rosterId: data.rosterId,
            gameFormatId: data.gameFormatId,
            numberOfGames: n,
          }),
        });
        toast({
          title: "Tournament Generated",
          description: `"${data.name}" created with ${n} games and balanced match plans.`,
        });
        setNavId('tournamentId', tournamentId);
        router.push('/tournaments/view');
      } else {
        toast({
          title: "Tournament Created",
          description: `The "${data.name}" tournament has been created.`,
        });
        setNavId('tournamentId', tournamentId);
        router.push('/tournaments/add-match');
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: e.message || "Could not create the tournament.",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Create New Tournament</CardTitle>
            <CardDescription>
              Give your tournament a name. Optionally enter the number of games to auto-generate all matches and balanced match plans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tournament Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Summer Championship" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="numberOfGames"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Games <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          placeholder="Leave blank to add games manually"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isGenerating && (
                  <>
                    <FormField
                      control={form.control}
                      name="rosterId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Roster</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a roster..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {rosters?.map(roster => (
                                <SelectItem key={roster.id} value={roster.id}>{roster.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gameFormatId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Game Format</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a game format..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {gameFormats?.filter(f => !f.isTemporary).map(format => (
                                <SelectItem key={format.id} value={format.id}>{format.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? 'Saving...'
                    : isGenerating
                      ? 'Generate Tournament'
                      : 'Create and Add Matches'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2 — Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 3.3 — Commit**

```bash
git add src/app/tournaments/new/page.tsx
git commit -m "feat(ui): add optional game generation fields to tournament creation form"
```

---

## Task 4: Tournament View — Court Time Gradient

**Files:**
- Modify: `src/app/tournaments/view/client.tsx`

- [ ] **Step 4.1 — Add match plan imports and the color helper**

At the top of `src/app/tournaments/view/client.tsx`, add the import for `useMatchPlansMultiple`:

```typescript
import { useMatchPlansMultiple } from '@/api/hooks/use-match-plans-multiple';
```

Add the following helper function directly inside the module (outside the component, after the `formatTime` function):

```typescript
function courtTimeColor(value: number, min: number, max: number): string {
  if (max === min) return 'inherit'
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const hue = t < 0.5 ? t * 2 * 45 : 45 + (t - 0.5) * 2 * 75
  const sat = t < 0.5 ? 85 : 70
  return `hsl(${Math.round(hue)}, ${sat}%, 40%)`
}
```

- [ ] **Step 4.2 — Fetch match plans and compute plan-period counts**

Inside the `TournamentViewPage` component, add this hook call after the existing `useGameFormats` call:

```typescript
const { data: allMatchPlans, isLoading: arePlansLoading } = useMatchPlansMultiple(tournament?.matchIds ?? []);
```

Add these two `useMemo` blocks after the existing `tournamentTimeTotals` useMemo:

```typescript
// Total periods on court per player across all tournament match plans
const planPeriodCounts = useMemo(() => {
  if (!allMatchPlans) return {} as Record<string, number>
  const counts: Record<string, number> = {}
  for (const plan of allMatchPlans) {
    for (const pp of plan.playerPositions) {
      counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
    }
  }
  return counts
}, [allMatchPlans])

// Periods on court per player per match, keyed by matchId then playerId
const planPeriodsByMatch = useMemo(() => {
  if (!allMatchPlans) return {} as Record<string, Record<string, number>>
  const result: Record<string, Record<string, number>> = {}
  for (const plan of allMatchPlans) {
    if (!result[plan.matchId]) result[plan.matchId] = {}
    for (const pp of plan.playerPositions) {
      result[plan.matchId][pp.playerId] = (result[plan.matchId][pp.playerId] ?? 0) + 1
    }
  }
  return result
}, [allMatchPlans])
```

- [ ] **Step 4.3 — Include `arePlansLoading` in the loading check**

Update the `isLoading` line to include `arePlansLoading`:

```typescript
const isLoading = isTournamentLoading || areMatchesLoading || isRosterLoading || isFormatLoading || areAllFormatsLoading || areSubEventsLoading || arePlansLoading;
```

- [ ] **Step 4.4 — Apply gradient to the Tournament Summary table**

In the Tournament Summary `<TableBody>`, replace the existing `players.map(...)` rows with the following (adds gradient color to the Total Time cell):

```tsx
{(() => {
  const planValues = players.map((p: any) => planPeriodCounts[p.id] ?? 0)
  const planMin = planValues.length ? Math.min(...planValues) : 0
  const planMax = planValues.length ? Math.max(...planValues) : 0
  return players.map((player: any) => (
    <TableRow key={player.id}>
      <TableCell className="font-medium">{player.name}</TableCell>
      <TableCell
        className="text-right font-mono font-semibold"
        style={{ color: courtTimeColor(planPeriodCounts[player.id] ?? 0, planMin, planMax) }}
      >
        {formatTime(tournamentTimeTotals[player.id]?.total || 0)}
      </TableCell>
      {positions.map((p: any) => (
        <TableCell key={p.id} className="text-right font-mono">
          {formatTime(tournamentTimeTotals[player.id]?.positions[p.abbreviation] || 0)}
        </TableCell>
      ))}
    </TableRow>
  ))
})()}
```

- [ ] **Step 4.5 — Apply gradient to each per-game table**

In the per-game `matches.map(...)` section, replace the existing `<TableBody>` `players.map(...)` rows with:

```tsx
{(() => {
  const matchPlanValues = players.map((p: any) => planPeriodsByMatch[match.id]?.[p.id] ?? 0)
  const matchPlanMin = matchPlanValues.length ? Math.min(...matchPlanValues) : 0
  const matchPlanMax = matchPlanValues.length ? Math.max(...matchPlanValues) : 0
  return players.map((player: any) => (
    <TableRow key={player.id}>
      <TableCell className="font-medium">{player.name}</TableCell>
      <TableCell
        className="text-right font-mono font-semibold"
        style={{ color: courtTimeColor(planPeriodsByMatch[match.id]?.[player.id] ?? 0, matchPlanMin, matchPlanMax) }}
      >
        {formatTime(matchTimes[player.id]?.total || 0)}
      </TableCell>
      {positions.map((p: any) => (
        <TableCell key={p.id} className="text-right font-mono">
          {formatTime(matchTimes[player.id]?.positions[p.abbreviation] || 0)}
        </TableCell>
      ))}
    </TableRow>
  ))
})()}
```

- [ ] **Step 4.6 — Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4.7 — Run all tests**

```bash
npm test
```

Expected: All tests pass (including the scheduler tests from Task 1).

- [ ] **Step 4.8 — Commit**

```bash
git add src/app/tournaments/view/client.tsx
git commit -m "feat(ui): add red-to-green court time gradient to tournament view"
```

---

## Task 5: Build Verification

- [ ] **Step 5.1 — Build the Next.js app**

```bash
npm run build
```

Expected: Build completes with no errors. Static export generated successfully.

- [ ] **Step 5.2 — Deploy the worker**

```bash
cd worker && npx wrangler deploy
```

Expected: Worker deployed successfully.

- [ ] **Step 5.3 — Smoke test the happy path**

Manual test steps:
1. Navigate to `/tournaments/new`
2. Enter a tournament name, set "Number of Games" to 3
3. Select a roster with 10+ players and a game format
4. Click "Generate Tournament" — should navigate to `/tournaments/view`
5. Confirm 3 games appear (Game 1, Game 2, Game 3)
6. Confirm the Tournament Summary table shows player names with red/amber/green coloured Total Time values
7. Click "Edit Plan" on Game 1 — confirm match plans are pre-populated with player assignments
8. Leave "Number of Games" blank — confirm "Create and Add Matches" button navigates to `/tournaments/add-match` as before

- [ ] **Step 5.4 — Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: smoke test corrections"
```
