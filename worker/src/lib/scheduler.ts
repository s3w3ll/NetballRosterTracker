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
