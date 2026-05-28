const W_COURT = 10
const W_ZONE_BALANCE = 5   // cross-game: within-player zone spread vs player's own other-zone average
const W_ZONE = 3           // cross-game: squad-level zone spread vs squad average for this zone
const W_POSITION = 1
const W_ZONE_STICKY = 20   // within-game: reward for staying in same zone as prior periods
const W_ZONE_ADJACENT = 8  // within-game: reward for moving to a neighbouring zone (A↔C, D↔C)

// Linear court layout: A — C — D
// Centre is adjacent to both ends; Attack and Defence are NOT adjacent to each other
const ZONE_ADJACENCY: Record<string, string[]> = {
  A: ['C'],
  C: ['A', 'D'],
  D: ['C'],
}

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

  const allZoneKeys = [...new Set(positions.map(p => p.positionGroup ?? p.abbreviation))]

  // Per-player running totals across games — only updated after each game ends.
  // Driving tournament-level zone balance without penalising within-game zone stickiness
  // is the reason this is NOT updated per-period like positionCounts is.
  const courtPeriods: Record<string, number> = {}
  const positionCounts: Record<string, Record<string, number>> = {}
  const crossGameZoneCounts: Record<string, Record<string, number>> = {}

  for (const p of players) {
    courtPeriods[p.id] = 0
    positionCounts[p.id] = {}
    crossGameZoneCounts[p.id] = {}
    for (const pos of positions) {
      positionCounts[p.id][pos.abbreviation] = 0
      const zoneKey = pos.positionGroup ?? pos.abbreviation
      crossGameZoneCounts[p.id][zoneKey] = 0
    }
  }

  const maxPeriodsPerGame = players.length > positions.length
    ? Math.floor((positions.length * numberOfPeriods) / players.length)
    : numberOfPeriods

  const plans: GeneratedPeriodPlan[] = []

  for (let gameIdx = 0; gameIdx < numberOfGames; gameIdx++) {
    const periodsThisGame: Record<string, number> = {}
    // Within-game zone counts — reset each game, drives the zone stickiness bonus
    const currentGameZoneCounts: Record<string, Record<string, number>> = {}

    for (const p of players) {
      periodsThisGame[p.id] = 0
      currentGameZoneCounts[p.id] = {}
      for (const zoneKey of allZoneKeys) {
        currentGameZoneCounts[p.id][zoneKey] = 0
      }
    }

    for (let period = 1; period <= numberOfPeriods; period++) {
      const assignedThisPeriod = new Set<string>()
      const playerPositions: Array<{ position: string; playerId: string }> = []

      for (const pos of positions) {
        const zoneKey = pos.positionGroup ?? pos.abbreviation
        const n = players.length

        const avgCourt = players.reduce((s, p) => s + courtPeriods[p.id], 0) / n
        const avgZone = players.reduce((s, p) => s + (crossGameZoneCounts[p.id][zoneKey] ?? 0), 0) / n
        const avgPos = players.reduce((s, p) => s + (positionCounts[p.id][pos.abbreviation] ?? 0), 0) / n
        const otherZoneKeys = allZoneKeys.filter(z => z !== zoneKey)

        const eligible = players.filter(p => !assignedThisPeriod.has(p.id) && periodsThisGame[p.id] < maxPeriodsPerGame)
        const pool = eligible.length > 0 ? eligible : players.filter(p => !assignedThisPeriod.has(p.id))

        let best: SchedulerPlayer | null = null
        let bestScore = -Infinity

        for (const player of pool) {
          const playerThisZone = crossGameZoneCounts[player.id][zoneKey] ?? 0
          const playerOtherZoneAvg = otherZoneKeys.length > 0
            ? otherZoneKeys.reduce((s, z) => s + (crossGameZoneCounts[player.id][z] ?? 0), 0) / otherZoneKeys.length
            : playerThisZone

          // Zone stickiness only for formats with position groups (6-aside)
          let zoneStickyScore = 0
          if (pos.positionGroup !== null) {
            if ((currentGameZoneCounts[player.id][zoneKey] ?? 0) > 0) {
              zoneStickyScore = W_ZONE_STICKY
            } else {
              const adjacentZones = ZONE_ADJACENCY[zoneKey] ?? []
              if (adjacentZones.some(z => (currentGameZoneCounts[player.id][z] ?? 0) > 0)) {
                zoneStickyScore = W_ZONE_ADJACENT
              }
            }
          }

          const score =
            (avgCourt - courtPeriods[player.id]) * W_COURT +
            (playerOtherZoneAvg - playerThisZone) * W_ZONE_BALANCE +
            (avgZone - playerThisZone) * W_ZONE +
            (avgPos - (positionCounts[player.id][pos.abbreviation] ?? 0)) * W_POSITION +
            zoneStickyScore

          if (score > bestScore) {
            bestScore = score
            best = player
          }
        }

        if (!best) break

        assignedThisPeriod.add(best.id)
        playerPositions.push({ position: pos.abbreviation, playerId: best.id })
        courtPeriods[best.id]++
        periodsThisGame[best.id]++
        positionCounts[best.id][pos.abbreviation]++
        currentGameZoneCounts[best.id][zoneKey] = (currentGameZoneCounts[best.id][zoneKey] ?? 0) + 1
        // crossGameZoneCounts is intentionally NOT updated here — merged after the game ends
      }

      plans.push({ matchIndex: gameIdx, quarter: period, playerPositions })
    }

    // Merge this game's zone history into cross-game totals (informs balance for subsequent games)
    for (const p of players) {
      for (const zoneKey of allZoneKeys) {
        crossGameZoneCounts[p.id][zoneKey] += currentGameZoneCounts[p.id][zoneKey] ?? 0
      }
    }
  }

  return plans
}
