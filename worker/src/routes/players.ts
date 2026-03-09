import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const players = new Hono<{ Bindings: Env; Variables: Variables }>()

// POST /api/rosters/:rosterId/players
players.post('/', async (c) => {
  const userId = c.get('userId')
  const rosterId = c.req.param('rosterId')
  const body = await c.req.json<{ id: string; name: string; position?: string }>()

  // Verify roster belongs to user
  const roster = await c.env.DB.prepare(
    'SELECT id FROM rosters WHERE id = ? AND user_id = ?'
  ).bind(rosterId, userId).first()
  if (!roster) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'INSERT INTO players (id, roster_id, user_id, name, position) VALUES (?, ?, ?, ?, ?)'
  ).bind(body.id, rosterId, userId, body.name, body.position ?? null).run()
  return c.json({ id: body.id }, 201)
})

// PUT /api/players/:id
players.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{ name?: string; position?: string }>()

  const result = await c.env.DB.prepare(
    'UPDATE players SET name = COALESCE(?, name), position = COALESCE(?, position) WHERE id = ? AND user_id = ?'
  ).bind(body.name ?? null, body.position ?? null, id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

// DELETE /api/players/:id
players.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const result = await c.env.DB.prepare(
    'DELETE FROM players WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default players
