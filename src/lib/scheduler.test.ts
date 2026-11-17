import { describe, it, expect } from 'vitest'
import { generateTournamentPlans, replanTournament } from '../../worker/src/lib/scheduler'

const sevenAside = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'].map(a => ({
  abbreviation: a,
  positionGroup: null,
}))

const sixAside = [
  { abbreviation: 'A1', positionGroup: 'A' },
  { abbreviation: 'A2', positionGroup: 'A' },
  { abbreviation: 'C1', positionGroup: 'C' },
  { abbreviation: 'C2', positionGroup: 'C' },
  { abbreviation: 'D1', positionGroup: 'D' },
  { abbreviation: 'D2', positionGroup: 'D' },
]

const makePlayers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))

describe('generateTournamentPlans', () => {
  it('returns empty array when players list is empty', () => {
    expect(generateTournamentPlans([], sevenAside, 4, 3)).toEqual([])
  })

  it('returns empty array when positions list is empty', () => {
    expect(generateTournamentPlans(makePlayers(10), [], 4, 3)).toEqual([])
  })

  it('generates the correct total number of period plans', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 3)
    expect(plans).toHaveLength(12) // 4 periods × 3 games
  })

  it('each period plan has exactly teamSize assignments when players >= teamSize', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 2)
    for (const plan of plans) {
      expect(plan.playerPositions).toHaveLength(7)
    }
  })

  it('no player appears twice in the same period', () => {
    const plans = generateTournamentPlans(makePlayers(10), sevenAside, 4, 3)
    for (const plan of plans) {
      const ids = plan.playerPositions.map(pp => pp.playerId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('period quarter is 1-based and matchIndex is 0-based', () => {
    const plans = generateTournamentPlans(makePlayers(8), sevenAside, 4, 2)
    const game0 = plans.filter(p => p.matchIndex === 0)
    const game1 = plans.filter(p => p.matchIndex === 1)
    expect(game0.map(p => p.quarter)).toEqual([1, 2, 3, 4])
    expect(game1.map(p => p.quarter)).toEqual([1, 2, 3, 4])
  })

  it('balances court time: max diff between players is at most 1 period over 5 games', () => {
    const players = makePlayers(10)
    const plans = generateTournamentPlans(players, sevenAside, 4, 5)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    const values = Object.values(counts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('when players == teamSize every player plays every period', () => {
    const players = makePlayers(7)
    const plans = generateTournamentPlans(players, sevenAside, 4, 2)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    for (const v of Object.values(counts)) {
      expect(v).toBe(8) // 4 periods × 2 games
    }
  })

  it('handles fewer players than teamSize by filling only available slots', () => {
    const plans = generateTournamentPlans(makePlayers(3), sevenAside, 2, 1)
    expect(plans[0].playerPositions).toHaveLength(3)
    expect(plans[1].playerPositions).toHaveLength(3)
  })

  it('balances zone time in 6-aside: max zone-A diff <= 10 over 6 games with 9 players (court equity is overarching; zone balance may suffer)', () => {
    const players = makePlayers(9)
    const plans = generateTournamentPlans(players, sixAside, 4, 6)
    const aZoneCounts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        const pos = sixAside.find(p => p.abbreviation === pp.position)!
        if (pos.positionGroup === 'A') {
          aZoneCounts[pp.playerId] = (aZoneCounts[pp.playerId] ?? 0) + 1
        }
      }
    }
    const values = Object.values(aZoneCounts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(10)
  })

  it('within-player zone balance: no player has a gap > 4 periods between their most and least played zones over 5 games', () => {
    const players = makePlayers(12)
    const plans = generateTournamentPlans(players, sixAside, 4, 5)
    const zoneCounts: Record<string, Record<string, number>> = {}
    for (const p of players) zoneCounts[p.id] = { A: 0, C: 0, D: 0 }
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        const pos = sixAside.find(p => p.abbreviation === pp.position)!
        const zone = pos.positionGroup!
        zoneCounts[pp.playerId][zone]++
      }
    }
    for (const player of players) {
      const zc = zoneCounts[player.id]
      const vals = Object.values(zc).filter(v => v > 0)
      if (vals.length > 1) {
        const gap = Math.max(...vals) - Math.min(...vals)
        expect(gap).toBeLessThanOrEqual(4)
      }
    }
  })

  it('within a single game with surplus players (11p/6pos), no player spans non-adjacent zones', () => {
    const players = makePlayers(11)
    const plans = generateTournamentPlans(players, sixAside, 4, 1)
    const ADJACENT: Record<string, string[]> = { A: ['C'], C: ['A', 'D'], D: ['C'] }
    for (const player of players) {
      const zones = new Set<string>()
      for (const plan of plans) {
        for (const pp of plan.playerPositions) {
          if (pp.playerId === player.id) {
            const pos = sixAside.find(p => p.abbreviation === pp.position)!
            zones.add(pos.positionGroup!)
          }
        }
      }
      for (const z1 of zones) {
        for (const z2 of zones) {
          if (z1 !== z2) {
            expect(ADJACENT[z1], `player ${player.id} spans non-adjacent zones ${z1} and ${z2}`).toContain(z2)
          }
        }
      }
    }
  })

  it('within a single game (exact squad size), each player stays in one zone throughout', () => {
    // 6 players = 6 positions: everyone plays every period, W_ZONE_STICKY dominates
    const players = makePlayers(6)
    const plans = generateTournamentPlans(players, sixAside, 4, 1)
    for (const player of players) {
      const zones = new Set<string>()
      for (const plan of plans) {
        for (const pp of plan.playerPositions) {
          if (pp.playerId === player.id) {
            const pos = sixAside.find(p => p.abbreviation === pp.position)!
            zones.add(pos.positionGroup!)
          }
        }
      }
      expect(zones.size).toBe(1)
    }
  })

  it('zone stickiness does not apply to 7-aside (court time still balanced)', () => {
    const players = makePlayers(10)
    const plans = generateTournamentPlans(players, sevenAside, 4, 5)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    const values = Object.values(counts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('carries court time deficit across games (state persists)', () => {
    // With 8 players and 7 positions over 2 games × 4 periods:
    // One player benched each period. Across 8 periods total, each should sit exactly once.
    const players = makePlayers(8)
    const plans = generateTournamentPlans(players, sevenAside, 4, 2)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    // Each player should play 7 periods out of 8 (one bench slot)
    for (const v of Object.values(counts)) {
      expect(v).toBe(7)
    }
  })
})

describe('replanTournament', () => {
  const allPeriods = [1, 2, 3, 4]
  const courtTotals = (plans: ReturnType<typeof replanTournament>) => {
    const t: Record<string, number> = {}
    for (const plan of plans) for (const pp of plan.playerPositions) t[pp.playerId] = (t[pp.playerId] ?? 0) + 1
    return t
  }

  it('with no history, matches generateTournamentPlans exactly', () => {
    const players = makePlayers(9)
    expect(replanTournament(players, sixAside, 4, [{ openPeriods: allPeriods }, { openPeriods: allPeriods }]))
      .toEqual(generateTournamentPlans(players, sixAside, 4, 2))
  })

  it('only plans open periods, keeping the 1-based quarter numbers', () => {
    const plans = replanTournament(makePlayers(8), sevenAside, 4, [{ openPeriods: [3, 4] }])
    expect(plans.map(p => p.quarter)).toEqual([3, 4])
  })

  it('a player who missed game 1 is made up for across the rest of the tournament', () => {
    // 8 players, 7-aside, 3 games. Game 1 was played: p0 sat out all 4 quarters, p1–p7 played 4 each.
    const players = makePlayers(8)
    const played: Record<string, Record<string, number>> = {}
    sevenAside.forEach((pos, i) => { played[`p${i + 1}`] = { [pos.abbreviation]: 4 } })

    const plans = replanTournament(players, sevenAside, 4, [
      { openPeriods: [], played },
      { openPeriods: allPeriods },
      { openPeriods: allPeriods },
    ])
    expect(plans.every(p => p.matchIndex !== 0)).toBe(true)

    const remaining = courtTotals(plans)
    // Fair share is 84 slots / 8 = 10.5 quarters, but p0 can play at most the 8 remaining —
    // so p0 should get every remaining quarter (closest possible to equity)...
    expect(remaining.p0).toBe(8)
    // ...and everyone else shares the rest evenly (final totals within 1 quarter of each other)
    const others = players.filter(p => p.id !== 'p0').map(p => (remaining[p.id] ?? 0) + 4)
    expect(Math.max(...others) - Math.min(...others)).toBeLessThanOrEqual(1)
  })

  it('counts fractional live time (mid-quarter subs) towards equity', () => {
    // 8 players, one game, Q1–Q2 played. p0 only got half a quarter; everyone else ~2 quarters.
    const players = makePlayers(8)
    const played: Record<string, Record<string, number>> = { p0: { GS: 0.5 } }
    for (let i = 1; i < 8; i++) played[`p${i}`] = { [sevenAside[(i - 1) % 7].abbreviation]: i === 1 ? 1.5 : 2 }
    const plans = replanTournament(players, sevenAside, 4, [{ openPeriods: [3, 4], played }])
    const remaining = courtTotals(plans)
    expect(remaining.p0).toBe(2) // plays both remaining quarters
  })

  it('respects the per-game cap including time already played in that game', () => {
    // 10 players / 7 positions / 4 quarters → cap of 2 quarters per game.
    const players = makePlayers(10)
    const played = { p0: { GS: 2 } } // p0 already at the cap in this game
    const plans = replanTournament(players, sevenAside, 4, [{ openPeriods: [3, 4], played }])
    // Plenty of players are under the cap, so p0 should rest
    expect(courtTotals(plans).p0 ?? 0).toBe(0)
  })

  it('ignores history for unknown players and positions', () => {
    const plans = replanTournament(makePlayers(7), sevenAside, 4, [
      { openPeriods: [1], played: { ghost: { GS: 3 }, p0: { XX: 3 } } },
    ])
    expect(plans[0].playerPositions).toHaveLength(7)
  })
})
