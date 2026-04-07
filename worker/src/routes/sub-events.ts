import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env, Variables } from '../index'

const subEvents = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/matches/:matchId/sub-events
subEvents.get('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  const rows = await c.env.DB.prepare(
    'SELECT * FROM sub_events WHERE match_id = ? ORDER BY period ASC, seconds_elapsed ASC'
  ).bind(matchId).all()

  return c.json(rows.results)
})

// POST /api/matches/:matchId/sub-events/bulk  — MUST be registered before /:id
subEvents.post('/bulk', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{
    events: Array<{
      id?: string
      period: number
      secondsElapsed: number
      playerId: string
      positionAbbr: string | null
    }>
  }>()

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  if (body.events.length === 0) return c.json({ count: 0 }, 201)

  const stmt = c.env.DB.prepare(
    'INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const inserts = body.events.map(e =>
    stmt.bind(e.id ?? uuidv4(), matchId, userId, e.period, e.secondsElapsed, e.playerId, e.positionAbbr ?? null)
  )
  await c.env.DB.batch(inserts)

  return c.json({ count: body.events.length }, 201)
})

// POST /api/matches/:matchId/sub-events
subEvents.post('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{
    id?: string
    period: number
    secondsElapsed: number
    playerId: string
    positionAbbr: string | null
  }>()

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  const id = body.id ?? uuidv4()
  await c.env.DB.prepare(
    'INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, matchId, userId, body.period, body.secondsElapsed, body.playerId, body.positionAbbr ?? null).run()

  return c.json({ id }, 201)
})

// PUT /api/matches/:matchId/sub-events/:id
subEvents.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{
    secondsElapsed: number
    positionAbbr: string | null
  }>()

  const result = await c.env.DB.prepare(
    'UPDATE sub_events SET seconds_elapsed = ?, position_abbr = ? WHERE id = ? AND user_id = ?'
  ).bind(body.secondsElapsed, body.positionAbbr, id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

// DELETE /api/matches/:matchId/sub-events/:id
subEvents.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const result = await c.env.DB.prepare(
    'DELETE FROM sub_events WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default subEvents
