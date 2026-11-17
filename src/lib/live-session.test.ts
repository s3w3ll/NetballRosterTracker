import { describe, it, expect } from 'vitest'
import { catchUpLiveSession, type LiveSession } from './live-session'

const base: LiveSession = {
  period: 2,
  courtPositions: { GS: 'alice', GA: null },
  remaining: 300,
  isActive: true,
  playerTimeInPosition: { alice: { GS: 100 } },
  savedAt: 1_000_000,
}

describe('catchUpLiveSession', () => {
  it('leaves a paused session untouched', () => {
    const r = catchUpLiveSession({ ...base, isActive: false }, base.savedAt + 60_000)
    expect(r.remaining).toBe(300)
    expect(r.playerTimeInPosition.alice.GS).toBe(100)
    expect(r.isActive).toBe(false)
  })

  it('runs the clock on and credits on-court players for the gap', () => {
    const r = catchUpLiveSession(base, base.savedAt + 45_000)
    expect(r.remaining).toBe(255)
    expect(r.playerTimeInPosition.alice.GS).toBe(145)
    expect(r.isActive).toBe(true)
  })

  it('stops at end of period when the gap is longer than the time left', () => {
    const r = catchUpLiveSession(base, base.savedAt + 600_000)
    expect(r.remaining).toBe(0)
    expect(r.playerTimeInPosition.alice.GS).toBe(400)
    expect(r.isActive).toBe(false)
  })
})
