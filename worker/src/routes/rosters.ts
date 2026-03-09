import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const rosters = new Hono<{ Bindings: Env; Variables: Variables }>()

rosters.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    'SELECT r.*, (SELECT COUNT(*) FROM players WHERE roster_id = r.id) as player_count FROM rosters r WHERE r.user_id = ? ORDER BY r.created_at DESC'
  ).bind(userId).all()
  return c.json(rows.results)
})

rosters.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    id: string
    name: string
    description?: string
    players: Array<{ id: string; name: string; position?: string }>
  }>()

  const stmts = [
    c.env.DB.prepare(
      'INSERT INTO rosters (id, user_id, name, description) VALUES (?, ?, ?, ?)'
    ).bind(body.id, userId, body.name, body.description ?? null),
    ...(body.players ?? []).map((p) =>
      c.env.DB.prepare(
        'INSERT INTO players (id, roster_id, user_id, name, position) VALUES (?, ?, ?, ?, ?)'
      ).bind(p.id, body.id, userId, p.name, p.position ?? null)
    ),
  ]
  await c.env.DB.batch(stmts)
  return c.json({ id: body.id }, 201)
})

rosters.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const roster = await c.env.DB.prepare(
    'SELECT * FROM rosters WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (!roster) return c.json({ error: 'Not found' }, 404)

  const players = await c.env.DB.prepare(
    'SELECT * FROM players WHERE roster_id = ?'
  ).bind(id).all()
  return c.json({ ...roster, players: players.results })
})

rosters.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{ name?: string; description?: string }>()

  const result = await c.env.DB.prepare(
    'UPDATE rosters SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ? AND user_id = ?'
  ).bind(body.name ?? null, body.description ?? null, id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

rosters.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const result = await c.env.DB.prepare(
    'DELETE FROM rosters WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default rosters
