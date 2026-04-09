# Tournament Auto-Generation Design

**Date:** 2026-04-09  
**Status:** Approved

## Overview

When creating a tournament, the user can optionally enter a number of games (1–20). If provided, the system automatically generates all matches and their match plans using a greedy fair-time scheduling algorithm, ensuring each player receives as close to equal court time and position/zone time as possible across the entire tournament.

---

## UI Changes

### `/tournaments/new` page

- Adds an optional `numberOfGames` integer field (1–20).
- If `numberOfGames` is provided, two additional **required** fields appear:
  - **Roster** — select from existing rosters
  - **Game Format** — select from non-temporary formats
- Submit button label:
  - With games: "Generate Tournament"
  - Without games: "Create and Add Matches" (unchanged)
- Post-submit navigation:
  - With games: navigate to `/tournaments/view`
  - Without games: navigate to `/tournaments/add-match` (unchanged)

### `/tournaments/view` page — Court Time Visualisation

Two locations display per-player court time with a **red → amber → green** colour gradient:

1. **Tournament summary panel** — one row per player, total periods on court across all games in the tournament, coloured relative to the min/max within the squad for the whole tournament.
2. **Per-game breakdown** — each player's period count within that specific game, coloured relative to the min/max within that game.

Colour is computed in the frontend:
- Scale: `t = (value - min) / (max - min)` clamped to [0, 1]
- Red = `t ≈ 0`, Amber = `t ≈ 0.5`, Green = `t = 1`
- Implemented as a CSS/inline style lerp — no backend changes required.

---

## Backend

### New endpoint: `POST /api/tournaments/:id/generate`

**Request body:**
```json
{
  "rosterId": "string",
  "gameFormatId": "string",
  "numberOfGames": 5
}
```

**Steps:**
1. Verify the tournament exists and belongs to the authenticated user.
2. Fetch all players for the roster from D1.
3. Fetch the game format + all its positions from D1 (`SELECT * FROM positions WHERE game_format_id = ?`).
4. Run the greedy scheduling algorithm (see below) to produce `numberOfGames` sets of period plans.
5. Use D1 `batch()` to atomically insert:
   - `numberOfGames` rows into `matches` (named "Game 1", "Game 2", …)
   - `numberOfGames` rows into `tournament_matches`
   - `numberOfGames × numberOfPeriods` rows into `match_plans`
6. Return `{ matchIds: string[] }`.

**Error handling:**
- Roster or format not found → 404
- D1 batch failure → 500 with message; no partial data written (atomic batch)
- Fewer players than `teamSize` → generate anyway, leaving some position slots empty

---

## Scheduling Algorithm (`worker/src/lib/scheduler.ts`)

### Inputs

| Parameter | Type | Description |
|---|---|---|
| `players` | `Player[]` | All players in the roster |
| `positions` | `Position[]` | All court positions in the format |
| `numberOfPeriods` | `number` | Periods per game |
| `numberOfGames` | `number` | Total games to generate |

### Global State (per player, across all games)

- `courtPeriods: number` — total periods on court
- `positionCounts: Record<string, number>` — keyed by position abbreviation
- `zoneCounts: Record<string, number>` — keyed by `positionGroup` (null-safe; if no group, uses abbreviation as key — equivalent to individual tracking)

### Algorithm

For each game, for each period, for each position slot (in order):

1. Exclude players already assigned this period.
2. Score each remaining player:

```
score = (avgCourtPeriods  - player.courtPeriods)  × W_COURT
      + (avgZoneCount     - player.zoneCount)      × W_ZONE
      + (avgPositionCount - player.positionCount)  × W_POSITION
```

Where:
- `W_COURT = 10`, `W_ZONE = 3`, `W_POSITION = 1`
- `avg*` = current global total ÷ number of players
- For formats with no `positionGroup` (7-aside): `zoneCounts` tracks by abbreviation, effectively identical to `positionCounts` — the zone term has no distinct effect but causes no harm

3. Assign the highest-scoring player to the slot.
4. Update that player's `courtPeriods`, `positionCounts`, and `zoneCounts`.

State is **never reset between games** — deficits carry forward across the full tournament.

### Output

```typescript
type GeneratedPlan = {
  matchIndex: number      // 0-based
  quarter: number         // 1-based
  playerPositions: Array<{ position: string; playerId: string }>
}
```

### Edge Cases

| Scenario | Behaviour |
|---|---|
| Players < teamSize | Fill available players; some position slots left empty |
| Players = teamSize | No bench; all players play all periods; position balance still runs |
| Players > teamSize | Bench rotation driven by `W_COURT` deficit; bench players get no position/zone counts updated |

---

## Data Flow

```
User submits form
  → POST /api/tournaments/:id/generate
    → D1: fetch players, positions
    → scheduler.ts: greedy algorithm
    → D1 batch: insert matches + tournament_matches + match_plans
  → Frontend receives { matchIds }
  → Navigate to /tournaments/view
    → Fetch tournament (includes matchIds)
    → Display court time summary with red→green gradient
```

---

## Files Changed

| File | Change |
|---|---|
| `src/app/tournaments/new/page.tsx` | Add numberOfGames, rosterId, gameFormatId fields + conditional logic |
| `worker/src/routes/tournaments.ts` | Add `POST /:id/generate` route |
| `worker/src/lib/scheduler.ts` | New file — greedy scheduling algorithm |
| `src/app/tournaments/view/client.tsx` | Add court time summary with red→green gradient |

No D1 schema changes required.
