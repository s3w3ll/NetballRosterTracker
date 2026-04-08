# Mobile UI Design — Sub-project D

**Date:** 2026-04-09
**Status:** Approved

## Goal

Make the live game tracker fully usable on a phone in portrait mode. The primary blocker is that all player placement uses HTML5 drag-and-drop, which does not fire on mobile touch screens. Secondary concern is that the bench scrolls off-screen below the court on small viewports.

## Scope

**In scope:**
- `LiveGameTracker` — three-zone mobile layout + tap-to-select interaction
- `MatchPlanEditor` — tap-to-select interaction (layout change not needed)

**Out of scope:**
- Tournament/roster/other pages (already stack acceptably on mobile)
- SubEventPanel (form-based, works on mobile as-is)
- Desktop layout (zero changes)

## Primary Device Target

Phone in portrait mode (`< 768px` / below Tailwind `md` breakpoint). Designed at 390px width as the baseline.

---

## Architecture

### 1. Mobile Layout — LiveGameTracker

On `< md` screens, replace the current `flex-col md:flex-row` stacked layout with a three-zone viewport-filling flex column:

```
┌─────────────────────────────┐  ~56px  top bar
│  ⏱ 12:34  ▶ Start  Q2 →   │
├─────────────────────────────┤
│                             │
│       SVG COURT             │  flex-1 (fills remaining viewport)
│                             │
├─────────────────────────────┤  ~80px  bench strip
│  [Amy] [Beth] [Cara] [Dana] │
└─────────────────────────────┘
```

**Top bar** (`md:hidden` shows compact version, full card layout hidden on mobile):
- Timer display (tappable to edit, same behaviour as current)
- Start/Pause button
- Period indicator + Next Period button
- All inline in a single `flex items-center justify-between` row
- Uses existing state (`time`, `isActive`, `currentPeriod`, etc.) — no new state

**Court** (`flex-1 min-h-0`):
- SVG court fills available height via `h-full w-full` on the container
- `aspect-ratio: 2/3` preserved — SVG scales within bounds without overflow
- Position pills sized/positioned identically to desktop (percentage-based already)

**Bench strip** (horizontal, `~80px` fixed height):
- `flex flex-row gap-2 overflow-x-auto` — horizontally scrollable if more than ~4 players
- Each player rendered as a compact chip: name + time-on-court badge
- Selected player gets `ring-2 ring-yellow-400` highlight

**Desktop layout** (`md:flex-row` etc.) — completely unchanged. The mobile zones are conditionally rendered using `md:hidden` / `hidden md:flex`.

### 2. Tap-to-Select State Machine

A single `selectedPlayerId: string | null` state is added to `LiveGameTracker`. This coexists with existing drag-and-drop — `onClick` handlers are added alongside `draggable`/`onDrop`, not replacing them.

**State transitions:**

| Current state | User action | Result |
|---|---|---|
| `null` | Tap bench player | Select player, highlight |
| `null` | Tap occupied court position | Select that player, highlight |
| `null` | Tap empty court position | No-op |
| `playerId` | Tap same player (bench or court) | Deselect, clear highlight |
| `playerId` | Tap empty court position | Place player there, stamp sub event, clear selection |
| `playerId` | Tap occupied court position (different player) | Swap players, stamp sub events for both, clear selection |
| `playerId` | Tap own court position | Deselect, clear highlight |

**Sub event stamping:** Identical to existing `handleDrop` logic — calls `createSubEventNonBlocking` with `secondsElapsed = periodDuration * 60 - time`, same as drag. No new API calls.

**Visual feedback:**
- Selected player: `ring-2 ring-yellow-400` on their chip/pill
- Empty court positions during selection: `border-yellow-300/70` (already the drag-highlight style)

### 3. MatchPlanEditor — Tap-to-Select

Same `selectedPlayerId` state machine added to `MatchPlanEditor`. Since plan mode has no timer, `secondsElapsed` is always `0` for starting lineup events (existing behaviour). `onClick` handlers added alongside existing `draggable`/`onDrop` — same pattern as LiveGameTracker.

No layout change needed for MatchPlanEditor — it's not time-pressured so some scrolling is acceptable.

---

## Implementation Notes

- **No new dependencies.** Touch support is achieved via the tap-to-select model, not a touch event polyfill or DnD library.
- **No mobile detection in JS.** Layout differences handled purely via Tailwind responsive classes (`md:hidden`, `hidden md:flex`). The tap `onClick` handlers are always registered — on desktop both drag and click work; on mobile only tap fires.
- **Viewport meta tag.** Already set correctly by Next.js root layout (`width=device-width, initial-scale=1`). No change needed.
- **SubEventPanel on mobile.** Renders below the court (below the fold). User scrolls to it when needed. Acceptable since it's not time-critical during live play.

---

## Files

**Modified:**
- `src/app/games/play/client.tsx` — add `selectedPlayerId` state, mobile three-zone layout, tap handlers on court pills + bench cards
- `src/app/games/play/components/MatchPlanEditor.tsx` — add `selectedPlayerId` state, tap handlers on court pills + bench list

---

## Success Criteria

- On a phone in portrait, the bench strip is visible without scrolling
- Tapping a bench player then a court position places them correctly
- Tapping an occupied court position selects that player for moving
- Sub events are stamped with correct `secondsElapsed` on tap-placement (same as drag)
- Desktop drag-and-drop behaviour is unchanged
- No JS errors on mobile browsers (Chrome for Android, Safari iOS)
