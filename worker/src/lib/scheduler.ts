const W_COURT = 10
const W_ZONE_BALANCE = 5  // within-player: how much less time vs player's own other-zone average
const W_ZONE = 3          // squad-level: how much less time vs squad average for this zone
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

  // Distinct zone keys — used for within-player zone balance scoring
  const allZoneKeys = [...new Set(positions.map(p => p.positionGroup ?? p.abbreviation))]

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

  // Maximum periods any player should play in a single game.
  // floor(court_slots_per_game / players) gives the equitable share.
  // Only applied when there are more players than positions (bench rotation possible).
  const maxPeriodsPerGame = players.length > positions.length
    ? Math.floor((positions.length * numberOfPeriods) / players.length)
    : numberOfPeriods

  const plans: GeneratedPeriodPlan[] = []

  for (let gameIdx = 0; gameIdx < numberOfGames; gameIdx++) {
    // Reset per-game period counts for this game
    const periodsThisGame: Record<string, number> = {}
    for (const p of players) periodsThisGame[p.id] = 0

    for (let period = 1; period <= numberOfPeriods; period++) {
      const assignedThisPeriod = new Set<string>()
      const playerPositions: Array<{ position: string; playerId: string }> = []

      for (const pos of positions) {
        const zoneKey = pos.positionGroup ?? pos.abbreviation
        const n = players.length

        const avgCourt = players.reduce((s, p) => s + courtPeriods[p.id], 0) / n
        const avgZone = players.reduce((s, p) => s + (zoneCounts[p.id][zoneKey] ?? 0), 0) / n
        const avgPos = players.reduce((s, p) => s + (positionCounts[p.id][pos.abbreviation] ?? 0), 0) / n

        // For zone balance: compare player's time in THIS zone vs their OTHER zones.
        // A player who has played more in other zones gets a bonus for this zone.
        const otherZoneKeys = allZoneKeys.filter(z => z !== zoneKey)

        // Separate eligible (under limit) from over-limit players so that
        // over-limit players are only considered when no eligible player remains.
        const eligible = players.filter(p => !assignedThisPeriod.has(p.id) && periodsThisGame[p.id] < maxPeriodsPerGame)
        const pool = eligible.length > 0 ? eligible : players.filter(p => !assignedThisPeriod.has(p.id))

        let best: SchedulerPlayer | null = null
        let bestScore = -Infinity

        for (const player of pool) {
          const playerThisZone = zoneCounts[player.id][zoneKey] ?? 0
          const playerOtherZoneAvg = otherZoneKeys.length > 0
            ? otherZoneKeys.reduce((s, z) => s + (zoneCounts[player.id][z] ?? 0), 0) / otherZoneKeys.length
            : playerThisZone  // single zone — balance term cancels out

          const score =
            (avgCourt - courtPeriods[player.id]) * W_COURT +
            (playerOtherZoneAvg - playerThisZone) * W_ZONE_BALANCE +
            (avgZone - playerThisZone) * W_ZONE +
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
        periodsThisGame[best.id]++
        positionCounts[best.id][pos.abbreviation]++
        zoneCounts[best.id][zoneKey] = (zoneCounts[best.id][zoneKey] ?? 0) + 1
      }

      plans.push({ matchIndex: gameIdx, quarter: period, playerPositions })
    }
  }

  return plans
}
