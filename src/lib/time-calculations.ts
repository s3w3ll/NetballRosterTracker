import type { SubEvent } from '@/api/types'

export type { SubEvent } from '@/api/types'

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
          // If already on court in a different position, close the previous interval first
          if (currentPosition !== null) {
            const interval = event.secondsElapsed - onTime
            totals[playerId].positions[currentPosition] =
              (totals[playerId].positions[currentPosition] || 0) + interval
            totals[playerId].total += interval
          }
          // Player coming on to a (new) position
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
