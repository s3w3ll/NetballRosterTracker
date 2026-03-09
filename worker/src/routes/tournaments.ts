import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const tournaments = new Hono<{ Bindings: Env; Variables: Variables }>()

tournaments.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    'SELECT * FROM tournaments WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json(rows.results)
})

tournaments.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ id: string; name: string }>()
  await c.env.DB.prepare(
    'INSERT INTO tournaments (id, user_id, name) VALUES (?, ?, ?)'
  ).bind(body.id, userId, body.name).run()
  return c.json({ id: body.id }, 201)
})

tournaments.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const tournament = await c.env.DB.prepare(
    'SELECT * FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  const matchRows = await c.env.DB.prepare(
    'SELECT match_id FROM tournament_matches WHERE tournament_id = ?'
  ).bind(id).all()
  const matchIds = matchRows.results.map((r: Record<string, unknown>) => r.match_id as string)
  return c.json({ ...tournament, matchIds })
})

tournaments.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{ name: string }>()
  const result = await c.env.DB.prepare(
    'UPDATE tournaments SET name = ? WHERE id = ? AND user_id = ?'
  ).bind(body.name, id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

// POST /api/tournaments/:id/matches
tournaments.post('/:id/matches', async (c) => {
  const userId = c.get('userId')
  const { id: tournamentId } = c.req.param()
  const body = await c.req.json<{ matchId: string }>()

  const tournament = await c.env.DB.prepare(
    'SELECT id FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(tournamentId, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO tournament_matches (tournament_id, match_id) VALUES (?, ?)'
  ).bind(tournamentId, body.matchId).run()
  return c.json({ tournamentId, matchId: body.matchId }, 201)
})

// DELETE /api/tournaments/:id/matches/:matchId
tournaments.delete('/:id/matches/:matchId', async (c) => {
  const userId = c.get('userId')
  const { id: tournamentId, matchId } = c.req.param()

  const tournament = await c.env.DB.prepare(
    'SELECT id FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(tournamentId, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'DELETE FROM tournament_matches WHERE tournament_id = ? AND match_id = ?'
  ).bind(tournamentId, matchId).run()
  return c.json({ tournamentId, matchId })
})

export default tournaments
