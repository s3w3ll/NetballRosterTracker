# Precision Time Tracking — Design Spec
**Date:** 2026-04-07
**Sub-project:** A (of 4: A=Precision Time Tracking, D=Mobile UX, B=6-aside Grouping, C=Sharing)
**Status:** Approved, ready for implementation planning

---

## Overview

The current app tracks player court time using whole-period snapshots: one `match_plans` row per quarter stores a flat JSON blob of who was in each position. This makes it impossible to:

- Record a substitution that happened mid-period
- Track a player who was injured and only played part of a period
- Recover from forgetting to start/stop the timer
- Build an accurate game plan with specific sub times

This spec replaces that model with a **sub-event system**: a log of on-court transitions that records exactly when within a period each player moved to a position or was benched. All time calculations derive from this log.

---

## Scope

**In scope (this spec):**
- New `sub_events` D1 table and migration from `match_plans`
- Backend API routes for sub events
- Shared time-calculation utility
- 6-aside position grouping utility (designed now to avoid later refactor)
- Live game UI: editable timer, sub stamping on drag-drop, sub event editor panel
- Plan/manual entry mode: unified match plan editor with period tabs + substitution timeline
- Tournament summary: recalculated from sub events

**Out of scope (later sub-projects):**
- Mobile UX improvements (Sub-project D)
- Sharing rosters/plans/tournaments with other users (Sub-project C)
- Full 6-aside position grouping UI (Sub-project B) — the utility is built here; the display toggle is deferred

---

## 1. Data Model

### New Table: `sub_events`

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

**Semantics:**
- `seconds_elapsed = 0` → starting lineup for that period
- `position_abbr = NULL` → player subbed off to bench
- One row per player per transition; multiple rows per player per period are normal
- Time is stored count-up (seconds into the period), even though the live game UI shows a countdown

**Deprecation of `match_plans`:**
- The `match_plans` table is kept during the migration window
- After migration is confirmed complete, the table and its routes are dropped
- No new writes go to `match_plans` after this feature ships

### Migration

Each existing `match_plans` row:
```json
{ "quarter": 2, "player_positions": [{ "playerId": "abc", "position": "GS" }] }
```
becomes one `sub_events` row per player, with `period = quarter` and `seconds_elapsed = 0`.

A one-time migration endpoint (`POST /api/migrate/match-plans`) performs this conversion. It is idempotent (uses INSERT OR IGNORE). This endpoint is **not** Firebase-JWT-guarded — it is protected by a `X-Migration-Secret` header checked against a Wrangler secret, since it operates across all users' data and is invoked once by the developer, not by end users.

### `positions` table change

Add a `position_group` column to support 6-aside grouping:

```sql
ALTER TABLE positions ADD COLUMN position_group TEXT;
```

For 6-aside formats: A1 and A2 get `position_group = 'A'`, C1/C2 → `'C'`, D1/D2 → `'D'`.
For 7-aside formats: `position_group` is NULL (no grouping applied).

---

## 2. Backend API

New route group mounted at `/api/matches/:matchId/sub-events` in the Hono worker.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/matches/:matchId/sub-events` | Fetch all sub events for a match (all periods) |
| `POST` | `/api/matches/:matchId/sub-events` | Create a single sub event |
| `PUT` | `/api/matches/:matchId/sub-events/:id` | Edit `seconds_elapsed` or `position_abbr` only |
| `DELETE` | `/api/matches/:matchId/sub-events/:id` | Delete a sub event |
| `POST` | `/api/matches/:matchId/sub-events/bulk` | Create multiple events in one request |
| `POST` | `/api/migrate/match-plans` | One-time migration: `match_plans` → `sub_events` |

**Design decisions:**
- `GET` returns all periods at once — client does all time calculations locally, avoiding chatty requests during a live game
- `PUT` is intentionally narrow: player and match cannot be changed (use delete + create instead)
- `bulk` accepts `{ events: SubEvent[] }` — used when saving a starting lineup (7 events at once) and when advancing to the next period
- All routes are auth-guarded via the existing Firebase JWT middleware

**New file:** `worker/src/routes/sub-events.ts`

**Frontend hook:** `src/api/hooks/use-sub-events.ts` — mirrors the pattern of `use-match-plans.ts`, exposing:
```ts
useSubEvents(matchId: string | null)
// returns { data, isLoading, create, update, remove, bulkCreate }
```

**Normalizer:** `normalizeSubEvent()` added to `src/api/types.ts` (snake_case → camelCase).

---

## 3. Time Calculation Logic

**New file:** `src/lib/time-calculations.ts`

This is a pure function — no hooks, no side effects — shared across the live game, plan view, and tournament summary. It replaces both `calculateMatchTimes()` in `tournaments/view/client.tsx` and the inline accumulation logic in `games/play/client.tsx`.

### Primary function

```ts
function calculatePlayerTimes(
  subEvents: SubEvent[],
  periodDuration: number   // seconds; periods are derived from events, not enumerated
): PlayerTimeTotals

type PlayerTimeTotals = Record<playerId, {
  total: number;                           // total seconds on court
  positions: Record<positionAbbr, number>; // seconds per position
}>
```

### Algorithm (per player, per period)

1. Filter events for this player + period; sort ascending by `seconds_elapsed`
2. Walk events in order:
   - Non-null `position_abbr` → player ON court; record `onTime = seconds_elapsed`, `currentPosition = position_abbr`
   - Null `position_abbr` → player OFF court; `interval = seconds_elapsed - onTime`; add interval to `positions[currentPosition]`; **set `currentPosition = null`** (prevents double-counting if the player comes back on later in the same period)
3. After last event: if player is still on court (`currentPosition !== null`), add `interval = periodDuration - onTime`
4. Accumulate per-position seconds into the player's totals across all periods

### 6-aside grouping function

```ts
function groupPositionTimes(
  positions: Record<positionAbbr, number>,
  positionGroups: Record<positionAbbr, string | null>
): Record<string, number>
```

Collapses sub-positions into their group: `{ A1: 480, A2: 480 }` → `{ A: 960 }`.
If `positionGroup` is null, the position key is used as-is.
Called as a second pass after `calculatePlayerTimes()` when displaying summaries.

---

## 4. Live Game UI Changes

**File:** `src/app/games/play/client.tsx`

### 4.1 Editable Timer (Time Recovery)

- The countdown display (`MM:SS`) becomes tappable
- Tapping pauses the timer and renders an inline `<input type="text">` pre-filled with the current `MM:SS`
- User edits the value and presses Enter or taps away to confirm
- Timer resumes from the corrected value; no existing sub events are retroactively adjusted
- Covers the primary "forgot to start/stop timer" recovery scenario

### 4.2 Sub Stamping on Drag-Drop

When a player is dragged to a position or to the bench:
1. Local `courtPositions` state updates immediately (UI stays responsive)
2. `seconds_elapsed` is computed: `periodDuration - currentTimerValue` (converts countdown to count-up)
3. A `sub_event` is written non-blocking via `createSubEventNonBlocking()` — a new function in `src/firebase/non-blocking-updates.tsx` following the existing pattern
4. If dragging to bench, `position_abbr = null`

Starting lineup (period 1, or after period advance): all court positions are written as `bulk` POST at `seconds_elapsed = 0`.

### 4.3 Sub Event Editor Panel

A collapsible section below the court, labelled **"This Period's Substitutions"**.

Displays all sub events for the current period in a table:

```
Period | Time  | Player | Position  | Actions
Q1     | 00:00 | Jess   | GS        | [edit time] [delete]
Q1     | 00:00 | Amy    | GA        | [edit time] [delete]
Q1     | 04:30 | Jess   | bench     | [edit time] [delete]
Q1     | 04:30 | Kate   | GS        | [edit time] [delete]
```

- **Edit time**: tapping the time cell opens an inline `MM:SS` input; saving calls `PUT /sub-events/:id`
- **Delete**: removes the event; calls `DELETE /sub-events/:id`
- **"Add substitution" button**: opens a dialog with period selector, time input, player dropdown, position dropdown

### 4.4 Period Advance Flow

When the coach taps "Next Period":
1. Capture current `courtPositions` (who is on court at end of period)
2. Bulk-write `sub_events` at `seconds_elapsed = 0` for the new period using those positions
3. Increment `currentPeriod`, reset timer to `periodDuration`
4. Clear the sub event editor panel display for the new period

---

## 5. Plan / Manual Entry Mode

**Context:** The existing `?mode=plan` query param on `/games/play` switches the page into a planning view (no live timer). The tournament view's "Edit Plan" button navigates here.

### Unified Match Plan Editor

Replaces the current plan view with a structured editor:

**Period tabs:** Q1 | Q2 | Q3 | Q4 (count driven by `gameFormat.numberOfPeriods`)

**Per period — Starting Lineup section:**
- Same position grid as live mode (court layout for 7-aside, 2×3 grid for 6-aside)
- Drag-drop assigns players; writes `sub_events` at `seconds_elapsed = 0`
- "Copy from previous period" button pre-fills with whoever finished the previous period on court (disabled/hidden for Q1 — no prior period exists)

**Per period — Substitutions section:**
- Chronological list of mid-period events (same table as Section 4.3)
- "Add substitution" opens a dialog: time input (MM:SS), player selector, position selector
- Rows are editable and deletable inline

**No timer in plan mode.** Time inputs are always manual. The `seconds_elapsed` stored is exactly what the user enters.

---

## 6. Tournament Summary Changes

**File:** `src/app/tournaments/view/client.tsx`

- Replace the `calculateMatchTimes()` call with the new `calculatePlayerTimes()` from `src/lib/time-calculations.ts`
- Replace `apiJSON` calls fetching `/plans` with calls fetching `/sub-events` per match
- The `useEffect` that fetches all match plans is updated to fetch all match sub events instead
- The summary table column headers remain the same; values are now accurate to the second rather than rounded to whole periods
- For 6-aside matches in a tournament, `groupPositionTimes()` is applied before rendering so columns show `A`, `C`, `D` instead of `A1`, `A2`, etc.

---

## 7. Build Sequence

Implementation should proceed in this order to avoid broken states:

1. **Schema + migration** — add `sub_events` table, `position_group` column, migration endpoint
2. **Backend routes** — `worker/src/routes/sub-events.ts`, mount in `index.ts`
3. **Frontend types + hook** — `normalizeSubEvent()`, `use-sub-events.ts`
4. **Time calculation utility** — `src/lib/time-calculations.ts` with unit-testable pure functions
5. **Live game UI** — editable timer, sub stamping, event editor panel, period advance flow
6. **Plan/manual editor** — unified match plan editor replacing current plan mode
7. **Tournament view** — swap calculation source from match_plans to sub_events
8. **Run migration** — execute migration endpoint against production D1
9. **Deprecate match_plans** — remove routes and table after confirming data integrity

---

## 8. Key Constraints & Risks

| Risk | Mitigation |
|------|------------|
| Migration loses existing plan data | Migration is idempotent; run against a D1 backup first; `match_plans` table kept until confirmed |
| Sub events written out of order (e.g. stamped at wrong time) | Sub event editor panel allows post-hoc correction; sort by `seconds_elapsed` in all calculations |
| Player deleted after sub events recorded | `ON DELETE CASCADE` on `player_id` FK removes their events; this is acceptable (player left the roster) |
| Two coaches editing the same match simultaneously | Out of scope for this sub-project; addressed in Sub-project C (Sharing) |
| Live game sub events lost if browser closes mid-game | Non-blocking writes go to D1 immediately on each drag-drop; no batch-at-end risk |

---

## 9. Out of Scope Decisions Made

- **No "injury" flag on sub events** — a sub-off at the injury time is sufficient; notes are not tracked
- **No real-time sync between devices** — deferred to Sub-project C
- **6-aside grouping display toggle** — utility built here; the UI toggle (expand/collapse A→A1/A2) deferred to Sub-project B
- **Timer direction** — countdown display is kept; `seconds_elapsed` stored as count-up internally; no user-facing change to timer direction
