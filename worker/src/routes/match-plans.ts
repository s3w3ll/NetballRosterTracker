import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const matchPlans = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/matches/:matchId/plans
matchPlans.get('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')

  // Verify match belongs to user
  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  const rows = await c.env.DB.prepare(
    'SELECT * FROM match_plans WHERE match_id = ? ORDER BY quarter ASC'
  ).bind(matchId).all()

  // Parse JSON player_positions back to objects
  const plans = rows.results.map((row: Record<string, unknown>) => ({
    ...row,
    playerPositions: JSON.parse(row.player_positions as string),
  }))
  return c.json(plans)
})

// POST /api/matches/:matchId/plans  (upsert by quarter)
matchPlans.post('/', async (c) => {
  const userId = c.get('userId')
  const matchId = c.req.param('matchId')
  const body = await c.req.json<{
    id: string
    quarter: number
    playerPositions: Array<{ position: string; playerId: string }>
  }>()

  const match = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND user_id = ?'
  ).bind(matchId, userId).first()
  if (!match) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(`
    INSERT INTO match_plans (id, match_id, user_id, quarter, player_positions)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET player_positions = excluded.player_positions
  `).bind(body.id, matchId, userId, body.quarter, JSON.stringify(body.playerPositions)).run()

  return c.json({ id: body.id }, 201)
})

// PUT /api/match-plans/:id
matchPlans.put('/:planId', async (c) => {
  const userId = c.get('userId')
  const { planId } = c.req.param()
  const body = await c.req.json<{
    playerPositions: Array<{ position: string; playerId: string }>
  }>()

  const result = await c.env.DB.prepare(
    'UPDATE match_plans SET player_positions = ? WHERE id = ? AND user_id = ?'
  ).bind(JSON.stringify(body.playerPositions), planId, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id: planId })
})

export default matchPlans
