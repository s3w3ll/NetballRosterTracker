import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const matches = new Hono<{ Bindings: Env; Variables: Variables }>()

matches.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    'SELECT * FROM matches WHERE user_id = ? ORDER BY start_time DESC'
  ).bind(userId).all()
  return c.json(rows.results)
})

matches.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    id: string
    name?: string
    team1RosterId?: string
    team2RosterId?: string
    gameFormatId?: string
    startTime?: string
  }>()

  await c.env.DB.prepare(
    'INSERT INTO matches (id, user_id, name, team1_roster_id, team2_roster_id, game_format_id, start_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    body.id, userId, body.name ?? null,
    body.team1RosterId ?? null, body.team2RosterId ?? null,
    body.gameFormatId ?? null, body.startTime ?? null
  ).run()
  return c.json({ id: body.id }, 201)
})

matches.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const match = await c.env.DB.prepare(
    'SELECT * FROM matches WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)
  return c.json(match)
})

matches.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{
    name?: string
    endTime?: string
    startTime?: string
    team1RosterId?: string
    team2RosterId?: string
    gameFormatId?: string
  }>()

  const result = await c.env.DB.prepare(`
    UPDATE matches SET
      name = COALESCE(?, name),
      end_time = COALESCE(?, end_time),
      start_time = COALESCE(?, start_time),
      team1_roster_id = COALESCE(?, team1_roster_id),
      team2_roster_id = COALESCE(?, team2_roster_id),
      game_format_id = COALESCE(?, game_format_id)
    WHERE id = ? AND user_id = ?
  `).bind(
    body.name ?? null, body.endTime ?? null, body.startTime ?? null,
    body.team1RosterId ?? null, body.team2RosterId ?? null, body.gameFormatId ?? null,
    id, userId
  ).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

matches.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const result = await c.env.DB.prepare(
    'DELETE FROM matches WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default matches
