import type { SubEvent } from '@/api/types'
import type { CourtPositions, LiveMoveEvent } from './live-subs'

type PlanEvent = Pick<SubEvent, 'period' | 'secondsElapsed' | 'playerId' | 'positionAbbr' | 'kind'>

/** A set of planned substitutions that happen at the same moment in a period. */
export interface PlannedSubGroup {
  /** Stable id within a match, e.g. "2:300" */
  key: string
  period: number
  secondsElapsed: number
  moves: LiveMoveEvent[]
}

/**
 * Planned starting lineup for a period (plan events at 0:00), limited to known
 * players and positions. Returns null when nothing is planned for that period.
 */
export function plannedLineup(
  events: PlanEvent[],
  period: number,
  positionAbbrs: string[],
  playerIds: Set<string>
): CourtPositions | null {
  const lineup: CourtPositions = Object.fromEntries(positionAbbrs.map(p => [p, null]))
  let any = false
  for (const e of events) {
    if (e.kind !== 'plan' || e.period !== period || e.secondsElapsed !== 0) continue
    if (!e.positionAbbr || !(e.positionAbbr in lineup) || !playerIds.has(e.playerId)) continue
    lineup[e.positionAbbr] = e.playerId
    any = true
  }
  return any ? lineup : null
}

/** Planned mid-period substitutions for a period, grouped by time, earliest first. */
export function plannedSubGroups(events: PlanEvent[], period: number, playerIds: Set<string>): PlannedSubGroup[] {
  const byTime = new Map<number, LiveMoveEvent[]>()
  for (const e of events) {
    if (e.kind !== 'plan' || e.period !== period || e.secondsElapsed <= 0 || !playerIds.has(e.playerId)) continue
    if (!byTime.has(e.secondsElapsed)) byTime.set(e.secondsElapsed, [])
    byTime.get(e.secondsElapsed)!.push({ playerId: e.playerId, positionAbbr: e.positionAbbr })
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([secondsElapsed, moves]) => ({ key: `${period}:${secondsElapsed}`, period, secondsElapsed, moves }))
}

/** True when the court already reflects every move (nothing left to apply). */
export function movesSatisfied(court: CourtPositions, moves: LiveMoveEvent[]): boolean {
  const onCourt = new Set(Object.values(court).filter(Boolean))
  return moves.every(m => (m.positionAbbr === null ? !onCourt.has(m.playerId) : court[m.positionAbbr] === m.playerId))
}

/** Moves that turn the current court into the given lineup (players not in it go to the bench). */
export function lineupMoves(court: CourtPositions, lineup: CourtPositions): LiveMoveEvent[] {
  const planned = new Set(Object.values(lineup).filter(Boolean))
  const toBench = Object.values(court)
    .filter((pid): pid is string => !!pid && !planned.has(pid))
    .map(pid => ({ playerId: pid, positionAbbr: null }))
  const toPlace = Object.entries(lineup)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([pos, pid]) => ({ playerId: pid, positionAbbr: pos }))
  return [...toBench, ...toPlace]
}

/**
 * Lineup to start the next period with. Follows the plan when one exists for that
 * period — a planned rotation should happen even if this period went off plan —
 * otherwise carries the current court over.
 */
export function nextPeriodCourt(current: CourtPositions, planned: CourtPositions | null): CourtPositions {
  return planned ? { ...planned } : { ...current }
}
