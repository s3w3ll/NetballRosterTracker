import { describe, it, expect } from 'vitest'
import { generateTournamentPlans } from '../../worker/src/lib/scheduler'

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

  it('balances court time: max diff between players is at most 2 periods over 5 games', () => {
    const players = makePlayers(10)
    const plans = generateTournamentPlans(players, sevenAside, 4, 5)
    const counts: Record<string, number> = {}
    for (const plan of plans) {
      for (const pp of plan.playerPositions) {
        counts[pp.playerId] = (counts[pp.playerId] ?? 0) + 1
      }
    }
    const values = Object.values(counts)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2)
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

  it('balances zone time in 6-aside: max zone-A diff <= 3 over 6 games with 9 players', () => {
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
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3)
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
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2)
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
