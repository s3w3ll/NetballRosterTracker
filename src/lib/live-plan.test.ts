import { describe, it, expect } from 'vitest'
import { plannedLineup, plannedSubGroups, movesSatisfied, lineupMoves, nextPeriodCourt } from './live-plan'
import { applyLiveMoves } from './live-subs'

const ev = (kind: 'plan' | 'actual', period: number, secondsElapsed: number, playerId: string, positionAbbr: string | null) =>
  ({ kind, period, secondsElapsed, playerId, positionAbbr })
const POS = ['GS', 'GA', 'C']
const PLAYERS = new Set(['alice', 'bea', 'cara', 'dee'])

describe('plannedLineup', () => {
  it('reads plan events at 0:00 for the period, ignoring actuals and unknown players', () => {
    const events = [
      ev('plan', 2, 0, 'alice', 'GS'), ev('plan', 2, 0, 'ghost', 'GA'),
      ev('actual', 2, 0, 'bea', 'C'), ev('plan', 1, 0, 'cara', 'C'), ev('plan', 2, 300, 'dee', 'C'),
    ]
    expect(plannedLineup(events, 2, POS, PLAYERS)).toEqual({ GS: 'alice', GA: null, C: null })
  })

  it('returns null when nothing is planned', () => {
    expect(plannedLineup([ev('actual', 1, 0, 'alice', 'GS')], 1, POS, PLAYERS)).toBeNull()
  })
})

describe('plannedSubGroups', () => {
  it('groups mid-period plan events by time, earliest first', () => {
    const groups = plannedSubGroups([
      ev('plan', 1, 450, 'cara', 'C'),
      ev('plan', 1, 300, 'bea', 'GS'), ev('plan', 1, 300, 'alice', null),
      ev('plan', 1, 0, 'alice', 'GS'), ev('actual', 1, 200, 'dee', 'GA'),
    ], 1, PLAYERS)
    expect(groups.map(g => g.key)).toEqual(['1:300', '1:450'])
    expect(groups[0].moves).toHaveLength(2)
  })
})

describe('movesSatisfied', () => {
  it('is true only when every planned move is already reflected on court', () => {
    const moves = [{ playerId: 'bea', positionAbbr: 'GS' }, { playerId: 'alice', positionAbbr: null }]
    expect(movesSatisfied({ GS: 'bea', GA: null, C: null }, moves)).toBe(true)
    expect(movesSatisfied({ GS: 'bea', GA: 'alice', C: null }, moves)).toBe(false)
    expect(movesSatisfied({ GS: 'alice', GA: null, C: null }, moves)).toBe(false)
  })
})

describe('lineupMoves', () => {
  it('turns the current court into the planned lineup', () => {
    const current = { GS: 'alice', GA: 'bea', C: 'cara' }
    const lineup = { GS: 'bea', GA: 'dee', C: null }
    const r = applyLiveMoves(current, lineupMoves(current, lineup))
    expect(r.court).toEqual(lineup)
    expect(r.events).toEqual(expect.arrayContaining([
      { playerId: 'alice', positionAbbr: null },
      { playerId: 'cara', positionAbbr: null },
      { playerId: 'bea', positionAbbr: 'GS' },
      { playerId: 'dee', positionAbbr: 'GA' },
    ]))
    expect(r.events).toHaveLength(4)
  })
})

describe('nextPeriodCourt', () => {
  it('follows the plan when there is one, otherwise carries the court over', () => {
    const current = { GS: 'alice', GA: null, C: null }
    expect(nextPeriodCourt(current, { GS: 'bea', GA: null, C: null })).toEqual({ GS: 'bea', GA: null, C: null })
    expect(nextPeriodCourt(current, null)).toEqual(current)
  })
})
