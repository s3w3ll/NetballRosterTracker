import { describe, it, expect } from 'vitest'
import { proposeReplan, orderMatches } from './replan'

const POS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'].map(abbreviation => ({ abbreviation, positionGroup: null }))
const FORMAT = { numberOfPeriods: 4, periodDuration: 10, positions: POS }
const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` }))
const ev = (kind: 'plan' | 'actual', period: number, s: number, playerId: string, positionAbbr: string | null) =>
  ({ kind, period, secondsElapsed: s, playerId, positionAbbr })

/** p1..p7 on court for the given periods; p0 on the bench */
const lineup = (kind: 'plan' | 'actual', periods: number[]) =>
  periods.flatMap(q => POS.map((pos, i) => ev(kind, q, 0, `p${i + 1}`, pos.abbreviation)))

describe('orderMatches', () => {
  it('orders by start time then numeric name', () => {
    const ordered = orderMatches([{ name: 'Game 10' }, { name: 'Game 2' }, { name: 'Game 1' }])
    expect(ordered.map(m => m.name)).toEqual(['Game 1', 'Game 2', 'Game 10'])
  })
})

describe('proposeReplan', () => {
  it('keeps played quarters fixed and replans only unplayed ones', () => {
    const matches = [
      { id: 'g1', name: 'Game 1', events: [...lineup('plan', [1, 2, 3, 4]), ...lineup('actual', [1, 2])] },
      { id: 'g2', name: 'Game 2', events: lineup('plan', [1, 2, 3, 4]) },
    ]
    const r = proposeReplan(matches, FORMAT, players)
    expect(r.changes.map(c => [c.matchId, c.periods])).toEqual([['g1', [3, 4]], ['g2', [1, 2, 3, 4]]])
    expect(r.openPeriodCount).toBe(6)
    expect(r.changes.every(c => c.lineups.every(l => c.periods.includes(l.period)))).toBe(true)
  })

  it('makes up a benched player\'s missed time in the rest of the tournament', () => {
    // Original plan benched p0 throughout game 1; game 1 has now been played as planned.
    const matches = [
      { id: 'g1', name: 'Game 1', events: [...lineup('plan', [1, 2, 3, 4]), ...lineup('actual', [1, 2, 3, 4])] },
      { id: 'g2', name: 'Game 2', events: lineup('plan', [1, 2, 3, 4]) },
      { id: 'g3', name: 'Game 3', events: lineup('plan', [1, 2, 3, 4]) },
    ]
    const r = proposeReplan(matches, FORMAT, players)
    expect(r.playedSoFar.p0).toBe(0)
    expect(r.before.p0).toBe(0)          // the old plan never plays p0
    expect(r.after.p0).toBe(8 * 600)     // replan plays p0 every remaining quarter
    const spread = (t: Record<string, number>) => Math.max(...Object.values(t)) - Math.min(...Object.values(t))
    expect(spread(r.after)).toBeLessThan(spread(r.before))
  })

  it('counts partial live time in a quarter that is in progress as played', () => {
    const matches = [{
      id: 'g1', name: 'Game 1',
      // What the live tracker records for "p0 on for p1 at GS at 5:00"
      events: [...lineup('plan', [1, 2, 3, 4]), ...lineup('actual', [1]), ev('actual', 1, 300, 'p0', 'GS'), ev('actual', 1, 300, 'p1', null)],
    }]
    const r = proposeReplan(matches, FORMAT, players)
    expect(r.changes[0].periods).toEqual([2, 3, 4])
    expect(r.playedSoFar.p0).toBe(300)   // on at 5:00 of Q1
    expect(r.playedSoFar.p1).toBe(300)   // replaced at GS at 5:00
  })
})
