import { describe, it, expect } from 'vitest'
import { calculatePlayerTimes, groupPositionTimes } from './time-calculations'

// Minimal SubEvent shape used in tests
const ev = (
  period: number,
  secondsElapsed: number,
  playerId: string,
  positionAbbr: string | null
) => ({ id: 'x', matchId: 'm1', period, secondsElapsed, playerId, positionAbbr })

describe('calculatePlayerTimes', () => {
  it('returns empty object for empty event list', () => {
    expect(calculatePlayerTimes([], 720)).toEqual({})
  })

  it('credits full period when player starts and never subs off', () => {
    const result = calculatePlayerTimes([ev(1, 0, 'p1', 'GS')], 720)
    expect(result['p1'].total).toBe(720)
    expect(result['p1'].positions['GS']).toBe(720)
  })

  it('credits partial time when player subs off mid-period', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 270, 'p1', null),
    ], 720)
    expect(result['p1'].total).toBe(270)
    expect(result['p1'].positions['GS']).toBe(270)
  })

  it('credits only the time from sub-on to period end when player comes on mid-period', () => {
    const result = calculatePlayerTimes([ev(1, 270, 'p1', 'GS')], 720)
    expect(result['p1'].total).toBe(450)   // 720 - 270
    expect(result['p1'].positions['GS']).toBe(450)
  })

  it('handles player who subs off and back on in same period without double-counting', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 240, 'p1', null),  // off at 4:00
      ev(1, 360, 'p1', 'GA'),  // back on at 6:00
    ], 720)
    expect(result['p1'].positions['GS']).toBe(240)
    expect(result['p1'].positions['GA']).toBe(360)  // 720 - 360
    expect(result['p1'].total).toBe(600)
  })

  it('accumulates time correctly across multiple periods', () => {
    const result = calculatePlayerTimes([
      ev(1, 0, 'p1', 'GS'),
      ev(2, 0, 'p1', 'GA'),
    ], 720)
    expect(result['p1'].total).toBe(1440)
    expect(result['p1'].positions['GS']).toBe(720)
    expect(result['p1'].positions['GA']).toBe(720)
  })

  it('tracks multiple players independently in same period', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 0,   'p2', 'GA'),
      ev(1, 360, 'p1', null),  // p1 off halfway
    ], 720)
    expect(result['p1'].total).toBe(360)
    expect(result['p2'].total).toBe(720)
  })

  it('handles direct position-to-position switch without bench event', () => {
    const result = calculatePlayerTimes([
      ev(1, 0,   'p1', 'GS'),
      ev(1, 360, 'p1', 'GA'),  // switches directly from GS to GA at 6:00
    ], 720)
    expect(result['p1'].positions['GS']).toBe(360)  // 0→360
    expect(result['p1'].positions['GA']).toBe(360)  // 360→720
    expect(result['p1'].total).toBe(720)
  })
})

describe('groupPositionTimes', () => {
  it('collapses sub-positions into parent group', () => {
    const times = { A1: 480, A2: 480, C1: 720 }
    const groups: Record<string, string | null> = { A1: 'A', A2: 'A', C1: 'C', C2: 'C' }
    expect(groupPositionTimes(times, groups)).toEqual({ A: 960, C: 720 })
  })

  it('uses position key as-is when positionGroup is null', () => {
    const times = { GS: 720, GA: 360 }
    const groups: Record<string, string | null> = { GS: null, GA: null }
    expect(groupPositionTimes(times, groups)).toEqual({ GS: 720, GA: 360 })
  })

  it('mixes grouped and ungrouped positions', () => {
    const times = { A1: 300, A2: 300, GS: 720 }
    const groups: Record<string, string | null> = { A1: 'A', A2: 'A', GS: null }
    expect(groupPositionTimes(times, groups)).toEqual({ A: 600, GS: 720 })
  })
})
