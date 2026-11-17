const W_CROSS_ZONE_BALANCE = 5  // cross-game within-player zone spread
const W_CROSS_ZONE = 3          // cross-game squad-level zone spread
const W_POSITION = 1
const W_CROSS_ADJACENT = 2      // cross-game adjacency preference for smooth zone transitions

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

/**
 * Players whose court time is within this many periods of the lowest count as
 * tied for equity. History from live games is fractional (a player subbed off
 * mid-quarter has e.g. 2.5 periods); with whole periods this is identical to an
 * exact-minimum comparison.
 */
const EQUITY_TOLERANCE = 0.5

/** Fallback when position_group isn't stored: "A1" → "A" (6-aside layouts). */
export function inferPositionGroup(abbreviation: string, positionGroup: string | null | undefined): string | null {
  return positionGroup ?? (abbreviation.match(/^([ACD])\d+$/i)?.[1].toUpperCase() ?? null)
}

/** One game in tournament order, for replanning. */
export interface ReplanGame {
  /** 1-based periods still to plan in this game (unplayed) */
  openPeriods: number[]
  /** Time already played in this game: playerId → positionAbbr → period-equivalents (may be fractional) */
  played?: Record<string, Record<string, number>>
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
  const allPeriods = Array.from({ length: numberOfPeriods }, (_, i) => i + 1)
  return replanTournament(
    players, positions, numberOfPeriods,
    Array.from({ length: numberOfGames }, () => ({ openPeriods: allPeriods }))
  )
}

/**
 * Plans every open period across a tournament, starting from what has already
 * been played. Time already played anywhere in the tournament counts towards
 * equity before anything is assigned, so a player who missed time is favoured
 * in the remaining periods — the rest of the tournament makes it up.
 *
 * Games are processed in the given order; `matchIndex` in the result is the
 * index into `games`.
 */
export function replanTournament(
  players: SchedulerPlayer[],
  positions: SchedulerPosition[],
  numberOfPeriods: number,
  games: ReplanGame[]
): GeneratedPeriodPlan[] {
  if (players.length === 0 || positions.length === 0) return []

  const zoneOf: Record<string, string> = Object.fromEntries(
    positions.map(p => [p.abbreviation, p.positionGroup ?? p.abbreviation])
  )
  const allZoneKeys = [...new Set(Object.values(zoneOf))]

  // Per-player running totals — crossGameZoneCounts only updated after each game ends, not per-period.
  // Separating from currentGameZoneCounts is what allows within-game stickiness
  // without penalising players for staying in the same zone.
  const courtPeriods: Record<string, number> = {}
  const positionCounts: Record<string, Record<string, number>> = {}
  const crossGameZoneCounts: Record<string, Record<string, number>> = {}

  for (const p of players) {
    courtPeriods[p.id] = 0
    positionCounts[p.id] = {}
    crossGameZoneCounts[p.id] = {}
    for (const pos of positions) {
      positionCounts[p.id][pos.abbreviation] = 0
      const zoneKey = zoneOf[pos.abbreviation]
      crossGameZoneCounts[p.id][zoneKey] = 0
    }
  }

  // Visits every known (player, position, amount) already played in a game
  const forEachPlayed = (game: ReplanGame, fn: (playerId: string, abbr: string, amount: number) => void) => {
    for (const [playerId, byPos] of Object.entries(game.played ?? {})) {
      if (!(playerId in courtPeriods)) continue
      for (const [abbr, amount] of Object.entries(byPos)) {
        if (abbr in zoneOf && amount > 0) fn(playerId, abbr, amount)
      }
    }
  }

  // Seed with everything already played anywhere in the tournament
  for (const game of games) {
    forEachPlayed(game, (playerId, abbr, amount) => {
      courtPeriods[playerId] += amount
      positionCounts[playerId][abbr] += amount
      crossGameZoneCounts[playerId][zoneOf[abbr]] += amount
    })
  }

  const maxPeriodsPerGame = players.length > positions.length
    ? Math.floor((positions.length * numberOfPeriods) / players.length)
    : numberOfPeriods

  const plans: GeneratedPeriodPlan[] = []

  for (let gameIdx = 0; gameIdx < games.length; gameIdx++) {
    const game = games[gameIdx]
    const periodsThisGame: Record<string, number> = {}
    const currentGameZoneCounts: Record<string, Record<string, number>> = {}

    for (const p of players) {
      periodsThisGame[p.id] = 0
      currentGameZoneCounts[p.id] = {}
      for (const zoneKey of allZoneKeys) {
        currentGameZoneCounts[p.id][zoneKey] = 0
      }
    }

    // Time already played in this game counts as "this game" (per-game cap, zone
    // stickiness) rather than cross-game history until the game is finished.
    forEachPlayed(game, (playerId, abbr, amount) => {
      periodsThisGame[playerId] += amount
      currentGameZoneCounts[playerId][zoneOf[abbr]] += amount
      crossGameZoneCounts[playerId][zoneOf[abbr]] -= amount
    })

    for (const period of game.openPeriods) {
      const assignedThisPeriod = new Set<string>()
      const playerPositions: Array<{ position: string; playerId: string }> = []

      // Narrows a candidate set to those with the minimum tournament court periods.
      // Court-time equity is the overarching constraint — it filters structurally before
      // any zone/position preference can compete.
      const equityPool = (base: SchedulerPlayer[]): SchedulerPlayer[] => {
        if (base.length === 0) return base
        const min = Math.min(...base.map(p => courtPeriods[p.id]))
        return base.filter(p => courtPeriods[p.id] <= min + EQUITY_TOLERANCE)
      }

      for (const pos of positions) {
        const zoneKey = pos.positionGroup ?? pos.abbreviation
        const isZoneFormat = pos.positionGroup !== null
        const adjacentZones = isZoneFormat ? (ZONE_ADJACENCY[zoneKey] ?? []) : []

        const unassigned = players.filter(p => !assignedThisPeriod.has(p.id))
        const withinLimit = unassigned.filter(p => periodsThisGame[p.id] < maxPeriodsPerGame)

        // Court equity is always applied: prefer within-limit players, fall back to any
        // unassigned when all have hit the per-game cap. equityPool is applied in both cases.
        const base = withinLimit.length > 0 ? withinLimit : unassigned

        let pool: SchedulerPlayer[]

        if (isZoneFormat) {
          const inZone = (p: SchedulerPlayer) => (currentGameZoneCounts[p.id][zoneKey] ?? 0) > 0
          const inAdjacent = (p: SchedulerPlayer) =>
            !inZone(p) && adjacentZones.some(z => (currentGameZoneCounts[p.id][z] ?? 0) > 0)

          // Court equity first (overarching), zone stickiness applied within that pool.
          // Zone stickiness can be broken to honour the court-time constraint.
          const cPool = equityPool(base)
          const sameZone = cPool.filter(inZone)
          const adjZone  = cPool.filter(p => !inZone(p) && inAdjacent(p))
          const fresh    = cPool.filter(p => !inZone(p) && !inAdjacent(p))
          pool = sameZone.length > 0 ? sameZone :
                 adjZone.length > 0  ? adjZone  :
                 fresh.length > 0    ? fresh    :
                 cPool
        } else {
          // 7-aside: court equity among the base pool (within-limit preferred, else all unassigned)
          pool = equityPool(base)
        }

        const n = players.length
        const avgZone = players.reduce((s, p) => s + (crossGameZoneCounts[p.id][zoneKey] ?? 0), 0) / n
        const avgPos  = players.reduce((s, p) => s + (positionCounts[p.id][pos.abbreviation] ?? 0), 0) / n
        const otherZoneKeys = allZoneKeys.filter(z => z !== zoneKey)

        let best: SchedulerPlayer | null = null
        let bestScore = -Infinity

        for (const player of pool) {
          const playerThisZone = crossGameZoneCounts[player.id][zoneKey] ?? 0
          const playerOtherZoneAvg = otherZoneKeys.length > 0
            ? otherZoneKeys.reduce((s, z) => s + (crossGameZoneCounts[player.id][z] ?? 0), 0) / otherZoneKeys.length
            : playerThisZone

          // Players with cross-game history in zones adjacent to this one are preferred
          // — ensures smooth A→C→D transitions rather than A→D jumps between games
          const adjacentZoneHistory = adjacentZones.reduce((s, z) => s + (crossGameZoneCounts[player.id][z] ?? 0), 0)

          const score =
            (playerOtherZoneAvg - playerThisZone) * W_CROSS_ZONE_BALANCE +
            (avgZone - playerThisZone) * W_CROSS_ZONE +
            (avgPos - (positionCounts[player.id][pos.abbreviation] ?? 0)) * W_POSITION +
            adjacentZoneHistory * W_CROSS_ADJACENT

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
        // crossGameZoneCounts intentionally NOT updated here — merged after the game ends
      }

      plans.push({ matchIndex: gameIdx, quarter: period, playerPositions })
    }

    // Merge this game's zone history into cross-game totals (informs balance for future games)
    for (const p of players) {
      for (const zoneKey of allZoneKeys) {
        crossGameZoneCounts[p.id][zoneKey] += currentGameZoneCounts[p.id][zoneKey] ?? 0
      }
    }
  }

  return plans
}
