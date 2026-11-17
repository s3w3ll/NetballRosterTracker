import type { SubEvent } from '@/api/types'
import { calculatePlayerTimes, projectedEvents, playedPeriods } from './time-calculations'
import { replanTournament, inferPositionGroup, type ReplanGame } from '../../worker/src/lib/scheduler'

type ReplanEvent = Pick<SubEvent, 'period' | 'secondsElapsed' | 'playerId' | 'positionAbbr' | 'kind'>

export interface ReplanMatchInput {
  id: string
  name?: string
  startTime?: string
  events: ReplanEvent[]
}

export interface ReplanFormat {
  numberOfPeriods: number
  /** minutes */
  periodDuration: number
  positions: Array<{ abbreviation: string; positionGroup?: string | null }>
}

export interface ReplanChange {
  matchId: string
  periods: number[]
  lineups: Array<{ period: number; playerId: string; positionAbbr: string }>
}

export interface ReplanProposal {
  changes: ReplanChange[]
  /** Unplayed quarters that will be replanned */
  openPeriodCount: number
  /** Seconds per player */
  playedSoFar: Record<string, number>
  /** Projected total with the current plan (actual so far + current plan for the rest) */
  before: Record<string, number>
  /** Projected total after replanning (actual so far + new plan) */
  after: Record<string, number>
}

/** Tournament order: start time, then name with numbers compared numerically ("Game 2" < "Game 10"). */
export function orderMatches<T extends { name?: string; startTime?: string }>(matches: T[]): T[] {
  return [...matches].sort((a, b) =>
    (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true })
  )
}

/**
 * Re-plans every unplayed quarter in a tournament so that the rest of the
 * tournament makes up for time players have missed so far. Played quarters
 * (any actual events) are fixed; everything else is replanned from scratch.
 */
export function proposeReplan(
  matches: ReplanMatchInput[],
  format: ReplanFormat,
  players: Array<{ id: string }>
): ReplanProposal {
  const periodSecs = format.periodDuration * 60
  const allPeriods = Array.from({ length: format.numberOfPeriods }, (_, i) => i + 1)
  const ordered = orderMatches(matches)

  const playedSoFar: Record<string, number> = {}
  const before: Record<string, number> = {}
  for (const p of players) { playedSoFar[p.id] = 0; before[p.id] = 0 }

  const games: ReplanGame[] = ordered.map(match => {
    const played = new Set(playedPeriods(match.events))

    // Actual time in played quarters, in period-equivalents per position
    const actualTimes = calculatePlayerTimes(
      match.events.filter(e => e.kind === 'actual' && played.has(e.period)),
      periodSecs
    )
    const playedMap: Record<string, Record<string, number>> = {}
    for (const [pid, info] of Object.entries(actualTimes)) {
      if (pid in playedSoFar) playedSoFar[pid] += info.total
      playedMap[pid] = Object.fromEntries(Object.entries(info.positions).map(([pos, s]) => [pos, s / periodSecs]))
    }

    for (const [pid, info] of Object.entries(calculatePlayerTimes(projectedEvents(match.events), periodSecs))) {
      if (pid in before) before[pid] += info.total
    }

    return { openPeriods: allPeriods.filter(p => !played.has(p)), played: playedMap }
  })

  const plans = replanTournament(
    players,
    format.positions.map(p => ({ abbreviation: p.abbreviation, positionGroup: inferPositionGroup(p.abbreviation, p.positionGroup) })),
    format.numberOfPeriods,
    games
  )

  const after: Record<string, number> = { ...playedSoFar }
  const changes: ReplanChange[] = ordered
    .map((match, i) => ({ matchId: match.id, periods: games[i].openPeriods, lineups: [] as ReplanChange['lineups'] }))
    .filter(c => c.periods.length > 0)
  const byMatch = new Map(changes.map(c => [c.matchId, c]))

  for (const plan of plans) {
    const change = byMatch.get(ordered[plan.matchIndex].id)
    if (!change) continue
    for (const pp of plan.playerPositions) {
      change.lineups.push({ period: plan.quarter, playerId: pp.playerId, positionAbbr: pp.position })
      if (pp.playerId in after) after[pp.playerId] += periodSecs
    }
  }

  return {
    changes,
    openPeriodCount: changes.reduce((n, c) => n + c.periods.length, 0),
    playedSoFar,
    before,
    after,
  }
}
