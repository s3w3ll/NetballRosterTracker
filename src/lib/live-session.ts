import type { CourtPositions } from './live-subs'

/**
 * Snapshot of an in-progress live game, kept in localStorage so a reload,
 * phone sleep or navigating away mid-game doesn't wipe the court, period and
 * clock (and doesn't cause the starting lineup to be re-recorded).
 */
export interface LiveSession {
  period: number
  courtPositions: CourtPositions
  /** Seconds left on the period clock at `savedAt` */
  remaining: number
  isActive: boolean
  /** playerId → positionAbbr → seconds (on-screen tally) */
  playerTimeInPosition: Record<string, Record<string, number>>
  /** Planned sub groups the coach skipped (e.g. "2:300"); optional for older snapshots */
  skippedPlanSubs?: string[]
  /** Epoch ms when this snapshot was written */
  savedAt: number
}

const key = (matchId: string) => `courttime:live:${matchId}`

export function loadLiveSession(matchId: string): LiveSession | null {
  try {
    const raw = localStorage.getItem(key(matchId))
    return raw ? (JSON.parse(raw) as LiveSession) : null
  } catch {
    return null
  }
}

export function saveLiveSession(matchId: string, session: LiveSession): void {
  try {
    localStorage.setItem(key(matchId), JSON.stringify(session))
  } catch {
    // storage unavailable (private mode / quota) — live game still works, just won't survive reload
  }
}

/**
 * Brings a saved snapshot up to `now`. If the clock was running when the page
 * went away, the real game clock kept running too: deduct the gap from the
 * clock (never below 0) and credit the same seconds to everyone on court.
 */
export function catchUpLiveSession(saved: LiveSession, now: number): LiveSession {
  if (!saved.isActive) return { ...saved, savedAt: now }

  const gap = Math.max(0, Math.floor((now - saved.savedAt) / 1000))
  const credited = Math.min(gap, saved.remaining)
  const remaining = saved.remaining - credited

  const playerTimeInPosition: LiveSession['playerTimeInPosition'] = JSON.parse(
    JSON.stringify(saved.playerTimeInPosition)
  )
  for (const [pos, playerId] of Object.entries(saved.courtPositions)) {
    if (!playerId) continue
    playerTimeInPosition[playerId] ??= {}
    playerTimeInPosition[playerId][pos] = (playerTimeInPosition[playerId][pos] ?? 0) + credited
  }

  return {
    ...saved,
    remaining,
    isActive: remaining > 0,
    playerTimeInPosition,
    savedAt: now,
  }
}
