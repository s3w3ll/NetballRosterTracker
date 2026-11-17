import { describe, it, expect } from 'vitest'
import { applyLiveMove, applyLiveMoves, type CourtPositions } from './live-subs'
import { calculatePlayerTimes } from './time-calculations'

const court = (c: Partial<CourtPositions>): CourtPositions => ({ GS: null, GA: null, C: null, ...c })

describe('applyLiveMove', () => {
  it('places a bench player on an empty position', () => {
    const r = applyLiveMove(court({}), 'alice', 'GS')
    expect(r.court.GS).toBe('alice')
    expect(r.events).toEqual([{ playerId: 'alice', positionAbbr: 'GS' }])
  })

  it('benches the occupant when a bench player replaces them', () => {
    const r = applyLiveMove(court({ GS: 'alice' }), 'bea', 'GS')
    expect(r.court.GS).toBe('bea')
    expect(r.events).toEqual([
      { playerId: 'bea', positionAbbr: 'GS' },
      { playerId: 'alice', positionAbbr: null },
    ])
  })

  it('swaps two on-court players', () => {
    const r = applyLiveMove(court({ GS: 'alice', GA: 'bea' }), 'alice', 'GA')
    expect(r.court).toEqual(court({ GS: 'bea', GA: 'alice' }))
    expect(r.events).toEqual([
      { playerId: 'alice', positionAbbr: 'GA' },
      { playerId: 'bea', positionAbbr: 'GS' },
    ])
  })

  it('moves an on-court player to an empty position, vacating the old one', () => {
    const r = applyLiveMove(court({ GS: 'alice' }), 'alice', 'C')
    expect(r.court).toEqual(court({ C: 'alice' }))
    expect(r.events).toEqual([{ playerId: 'alice', positionAbbr: 'C' }])
  })

  it('sends an on-court player to the bench', () => {
    const r = applyLiveMove(court({ GS: 'alice' }), 'alice', null)
    expect(r.court.GS).toBeNull()
    expect(r.events).toEqual([{ playerId: 'alice', positionAbbr: null }])
  })

  it('is a no-op for dropping on own position or benching a bench player', () => {
    const c = court({ GS: 'alice' })
    expect(applyLiveMove(c, 'alice', 'GS').events).toEqual([])
    expect(applyLiveMove(c, 'bea', null).events).toEqual([])
    expect(applyLiveMove(c, 'bea', 'XX').events).toEqual([])
  })

  it('recorded events reproduce correct playing time (bench → occupied position at 5:00)', () => {
    let c = court({})
    const log: Array<{ s: number; playerId: string; positionAbbr: string | null }> = []
    const move = (s: number, p: string, t: string | null) => {
      const r = applyLiveMove(c, p, t)
      c = r.court
      r.events.forEach(e => log.push({ s, ...e }))
    }
    move(0, 'alice', 'GS')
    move(300, 'bea', 'GS')

    const times = calculatePlayerTimes(
      log.map((e, i) => ({ id: String(i), matchId: 'm', period: 1, secondsElapsed: e.s, playerId: e.playerId, positionAbbr: e.positionAbbr })),
      600
    )
    expect(times.alice.total).toBe(300)
    expect(times.bea.total).toBe(300)
  })
})

describe('applyLiveMoves', () => {
  it('records one net event per player for a simultaneous rotation', () => {
    // Plan at 5:00: Bea on for Alice at GS, Alice moves to GA, Cara (at GA) to bench
    const start = court({ GS: 'alice', GA: 'cara' })
    const r = applyLiveMoves(start, [
      { playerId: 'bea', positionAbbr: 'GS' },
      { playerId: 'alice', positionAbbr: 'GA' },
      { playerId: 'cara', positionAbbr: null },
    ])
    expect(r.court).toEqual(court({ GS: 'bea', GA: 'alice' }))
    expect(r.events).toHaveLength(3)
    expect(r.events).toEqual(expect.arrayContaining([
      { playerId: 'bea', positionAbbr: 'GS' },
      { playerId: 'alice', positionAbbr: 'GA' },
      { playerId: 'cara', positionAbbr: null },
    ]))
  })

  it('records nothing when the moves leave the court unchanged', () => {
    const c = court({ GS: 'alice' })
    expect(applyLiveMoves(c, [{ playerId: 'alice', positionAbbr: 'GS' }]).events).toEqual([])
  })
})
