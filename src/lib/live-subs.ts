/** positionAbbr → playerId currently on court there (null = empty) */
export type CourtPositions = Record<string, string | null>

/** A substitution to record: player moves to a position, or to the bench (null). */
export interface LiveMoveEvent {
  playerId: string
  positionAbbr: string | null
}

/**
 * Applies one live move (drag/tap) to the court and returns the sub events that
 * must be recorded so `calculatePlayerTimes` reproduces the same court state.
 *
 * Every player whose spot changes gets exactly one event. In particular, a bench
 * player dropped onto an occupied position sends the occupant to the bench —
 * without that event the occupant keeps accruing time until the period ends.
 *
 * @param target  Position abbreviation, or null to send the player to the bench.
 */
export function applyLiveMove(
  court: CourtPositions,
  playerId: string,
  target: string | null
): { court: CourtPositions; events: LiveMoveEvent[] } {
  const from = Object.keys(court).find(p => court[p] === playerId) ?? null

  // Bench drop
  if (target === null) {
    if (from === null) return { court, events: [] }
    return {
      court: { ...court, [from]: null },
      events: [{ playerId, positionAbbr: null }],
    }
  }

  // Dropped on own position, or unknown position — nothing changes
  if (from === target || !(target in court)) return { court, events: [] }

  const occupant = court[target]
  const next: CourtPositions = { ...court, [target]: playerId }
  const events: LiveMoveEvent[] = [{ playerId, positionAbbr: target }]

  if (from !== null) {
    // Swap on court: occupant (if any) takes the mover's old spot
    next[from] = occupant
    if (occupant) events.push({ playerId: occupant, positionAbbr: from })
  } else if (occupant) {
    // Bench player replaces occupant: occupant goes to the bench
    events.push({ playerId: occupant, positionAbbr: null })
  }

  return { court: next, events }
}

/**
 * One event per player whose spot differs between two court states — the
 * player's final location. Used when several moves happen at the same instant:
 * recording only the end state avoids same-timestamp events whose order the
 * database doesn't guarantee.
 */
export function diffCourts(before: CourtPositions, after: CourtPositions): LiveMoveEvent[] {
  const locate = (court: CourtPositions) => {
    const where = new Map<string, string>()
    for (const [pos, pid] of Object.entries(court)) if (pid) where.set(pid, pos)
    return where
  }
  const was = locate(before)
  const now = locate(after)
  const events: LiveMoveEvent[] = []
  for (const pid of new Set([...was.keys(), ...now.keys()])) {
    const to = now.get(pid) ?? null
    if ((was.get(pid) ?? null) !== to) events.push({ playerId: pid, positionAbbr: to })
  }
  return events
}

/** Applies several moves at the same instant (e.g. a planned rotation) and returns the net events. */
export function applyLiveMoves(
  court: CourtPositions,
  moves: LiveMoveEvent[]
): { court: CourtPositions; events: LiveMoveEvent[] } {
  const after = moves.reduce((c, m) => applyLiveMove(c, m.playerId, m.positionAbbr).court, court)
  return { court: after, events: diffCourts(court, after) }
}
