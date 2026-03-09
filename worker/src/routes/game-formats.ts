import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const gameFormats = new Hono<{ Bindings: Env; Variables: Variables }>()

gameFormats.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    'SELECT * FROM game_formats WHERE user_id = ?'
  ).bind(userId).all()
  return c.json(rows.results)
})

gameFormats.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    id: string
    name: string
    teamSize: number
    numberOfPeriods: number
    periodDuration: number
    isTemporary?: boolean
    positions: Array<{ id: string; name: string; abbreviation: string; icon?: string }>
  }>()

  const stmts = [
    c.env.DB.prepare(
      'INSERT INTO game_formats (id, user_id, name, team_size, number_of_periods, period_duration, is_temporary) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(body.id, userId, body.name, body.teamSize, body.numberOfPeriods, body.periodDuration, body.isTemporary ? 1 : 0),
    ...(body.positions ?? []).map((p) =>
      c.env.DB.prepare(
        'INSERT INTO positions (id, game_format_id, user_id, name, abbreviation, icon) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(p.id, body.id, userId, p.name, p.abbreviation, p.icon ?? null)
    ),
  ]
  await c.env.DB.batch(stmts)
  return c.json({ id: body.id }, 201)
})

gameFormats.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const format = await c.env.DB.prepare(
    'SELECT * FROM game_formats WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (!format) return c.json({ error: 'Not found' }, 404)

  const positions = await c.env.DB.prepare(
    'SELECT * FROM positions WHERE game_format_id = ?'
  ).bind(id).all()
  return c.json({ ...format, positions: positions.results })
})

gameFormats.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{
    name?: string
    teamSize?: number
    numberOfPeriods?: number
    periodDuration?: number
  }>()

  const result = await c.env.DB.prepare(`
    UPDATE game_formats SET
      name = COALESCE(?, name),
      team_size = COALESCE(?, team_size),
      number_of_periods = COALESCE(?, number_of_periods),
      period_duration = COALESCE(?, period_duration)
    WHERE id = ? AND user_id = ?
  `).bind(
    body.name ?? null,
    body.teamSize ?? null,
    body.numberOfPeriods ?? null,
    body.periodDuration ?? null,
    id, userId
  ).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

gameFormats.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const result = await c.env.DB.prepare(
    'DELETE FROM game_formats WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

// POST /api/game-formats/:id/positions
gameFormats.post('/:id/positions', async (c) => {
  const userId = c.get('userId')
  const { id: formatId } = c.req.param()
  const body = await c.req.json<{ id: string; name: string; abbreviation: string; icon?: string }>()

  const format = await c.env.DB.prepare(
    'SELECT id FROM game_formats WHERE id = ? AND user_id = ?'
  ).bind(formatId, userId).first()
  if (!format) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'INSERT INTO positions (id, game_format_id, user_id, name, abbreviation, icon) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(body.id, formatId, userId, body.name, body.abbreviation, body.icon ?? null).run()
  return c.json({ id: body.id }, 201)
})

export default gameFormats
