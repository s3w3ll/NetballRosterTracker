import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env, Variables } from '../index'

const subEvents = new Hono<{ Bindings: Env; Variables: Variables }>()

type Kind = 'plan' | 'actual'
interface EventBody {
  id?: string
  period: number
  secondsElapsed: number
  playerId: string
  positionAbbr: string | null
  kind?: Kind
}

// Missing kind = 'plan' to match the column default (keeps older cached clients working).
const parseKind = (k: unknown): Kind | null =>
  k === undefined ? 'plan' : k === 'plan' || k === 'actual' ? k : null

const INSERT_SQL =
  'INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'

async function ownsMatch(db: D1Database, matchId: string | undefined, userId: string) {
  if (!matchId) return false
  return Boolean(await db.prepare('SELECT id FROM matches WHERE id = ? AND user_id = ?').bind(matchId, userId).first())
}

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
  const body = await c.req.json<{ events: EventBody[] }>()

  if (!(await ownsMatch(c.env.DB, matchId, userId))) return c.json({ error: 'Not found' }, 404)

  if (body.events.length === 0) return c.json({ count: 0 }, 201)
  if (body.events.some(e => parseKind(e.kind) === null)) return c.json({ error: "kind must be 'plan' or 'actual'" }, 400)

  const stmt = c.env.DB.prepare(INSERT_SQL)
  const inserts = body.events.map(e =>
    stmt.bind(e.id ?? uuidv4(), matchId, userId, e.period, e.secondsElapsed, e.playerId, e.positionAbbr ?? null, parseKind(e.kind))
  )
  await c.env.DB.batch(inserts)

  return c.json({ count: body.events.length }, 201)
})

// POST /api/matches/:matchId/sub-events
subEvents.post('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<EventBody>()

  if (!(await ownsMatch(c.env.DB, matchId, userId))) return c.json({ error: 'Not found' }, 404)

  const kind = parseKind(body.kind)
  if (kind === null) return c.json({ error: "kind must be 'plan' or 'actual'" }, 400)

  const id = body.id ?? uuidv4()
  await c.env.DB.prepare(INSERT_SQL)
    .bind(id, matchId, userId, body.period, body.secondsElapsed, body.playerId, body.positionAbbr ?? null, kind).run()

  return c.json({ id }, 201)
})

// PUT /api/matches/:matchId/sub-events/plan-lineups  — MUST be registered before /:id
// Atomically replaces the planned starting lineups (plan events at 0:00) for a match.
// Actual (live) events and planned mid-period subs are left untouched.
subEvents.put('/plan-lineups', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{ events: EventBody[] }>()

  if (!(await ownsMatch(c.env.DB, matchId, userId))) return c.json({ error: 'Not found' }, 404)

  const stmt = c.env.DB.prepare(INSERT_SQL)
  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM sub_events WHERE match_id = ? AND user_id = ? AND kind = 'plan' AND seconds_elapsed = 0"
    ).bind(matchId, userId),
    ...body.events.map(e =>
      stmt.bind(e.id ?? uuidv4(), matchId, userId, e.period, 0, e.playerId, e.positionAbbr ?? null, 'plan')
    ),
  ])

  return c.json({ count: body.events.length })
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
