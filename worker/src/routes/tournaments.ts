import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env, Variables } from '../index'
import { generateTournamentPlans } from '../lib/scheduler'

const tournaments = new Hono<{ Bindings: Env; Variables: Variables }>()

tournaments.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await c.env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.tournament_id = t.id) AS match_count
     FROM tournaments t WHERE t.user_id = ? ORDER BY t.created_at DESC`
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

// DELETE /api/tournaments/:id
tournaments.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const tournament = await c.env.DB.prepare(
    'SELECT id FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  // Fetch associated match IDs before deleting the tournament
  const matchRows = await c.env.DB.prepare(
    'SELECT match_id FROM tournament_matches WHERE tournament_id = ?'
  ).bind(id).all()
  const matchIds = matchRows.results.map((r: Record<string, unknown>) => r.match_id as string)

  // Atomically delete the tournament (cascades to tournament_matches) and all its matches
  // (match deletion cascades to match_plans and sub_events via their FK constraints)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tournaments WHERE id = ? AND user_id = ?').bind(id, userId),
    ...matchIds.map((matchId) =>
      c.env.DB.prepare('DELETE FROM matches WHERE id = ? AND user_id = ?').bind(matchId, userId)
    ),
  ])

  return c.json({ id })
})

// POST /api/tournaments/:id/generate
tournaments.post('/:id/generate', async (c) => {
  const userId = c.get('userId')
  const { id: tournamentId } = c.req.param()
  const body = await c.req.json<{
    rosterId: string
    gameFormatId: string
    numberOfGames: number
  }>()

  const { numberOfGames } = body
  if (!Number.isInteger(numberOfGames) || numberOfGames < 1 || numberOfGames > 20) {
    return c.json({ error: 'numberOfGames must be an integer between 1 and 20' }, 400)
  }

  // Verify tournament ownership
  const tournament = await c.env.DB.prepare(
    'SELECT id FROM tournaments WHERE id = ? AND user_id = ?'
  ).bind(tournamentId, userId).first()
  if (!tournament) return c.json({ error: 'Not found' }, 404)

  // Fetch players for the roster (with ownership check via roster join)
  const playersResult = await c.env.DB.prepare(
    'SELECT p.id FROM players p INNER JOIN rosters r ON r.id = p.roster_id WHERE p.roster_id = ? AND r.user_id = ?'
  ).bind(body.rosterId, userId).all()
  const players = playersResult.results as Array<{ id: string }>

  // Fetch game format (to get number_of_periods)
  const gameFormat = await c.env.DB.prepare(
    'SELECT number_of_periods FROM game_formats WHERE id = ? AND user_id = ?'
  ).bind(body.gameFormatId, userId).first() as { number_of_periods: number } | null
  if (!gameFormat) return c.json({ error: 'Game format not found' }, 404)

  // Fetch positions for the game format (ordered by rowid to preserve display order)
  const positionsResult = await c.env.DB.prepare(
    'SELECT abbreviation, position_group FROM positions WHERE game_format_id = ? ORDER BY rowid'
  ).bind(body.gameFormatId).all()
  const positions = (positionsResult.results as Array<{ abbreviation: string; position_group: string | null }>)
    .map(p => ({
      abbreviation: p.abbreviation,
      // Fall back to inferring group from abbreviation (e.g. "A1" → "A") when position_group
      // is not stored in DB — covers all existing records created before position_group was written
      positionGroup: p.position_group ?? (p.abbreviation.match(/^([ACD])\d+$/i)?.[1].toUpperCase() ?? null),
    }))

  // Generate all period plans via greedy scheduler
  const plans = generateTournamentPlans(players, positions, gameFormat.number_of_periods, numberOfGames)

  // Pre-generate all match IDs
  const matchIds: string[] = Array.from({ length: numberOfGames }, () => uuidv4())
  const now = new Date().toISOString()

  // Build atomic batch: matches + tournament links + match plans
  const stmts = [
    ...matchIds.map((matchId, i) =>
      c.env.DB.prepare(
        'INSERT INTO matches (id, user_id, name, team1_roster_id, game_format_id, start_time) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(matchId, userId, `Game ${i + 1}`, body.rosterId, body.gameFormatId, now)
    ),
    ...matchIds.map((matchId) =>
      c.env.DB.prepare(
        'INSERT OR IGNORE INTO tournament_matches (tournament_id, match_id) VALUES (?, ?)'
      ).bind(tournamentId, matchId)
    ),
    ...plans.map((plan) =>
      c.env.DB.prepare(
        'INSERT INTO match_plans (id, match_id, user_id, quarter, player_positions) VALUES (?, ?, ?, ?, ?)'
      ).bind(uuidv4(), matchIds[plan.matchIndex], userId, plan.quarter, JSON.stringify(plan.playerPositions))
    ),
  ]

  await c.env.DB.batch(stmts)

  return c.json({ matchIds }, 201)
})

export default tournaments
