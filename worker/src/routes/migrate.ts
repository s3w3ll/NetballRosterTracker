import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env } from '../index'

const migrate = new Hono<{ Bindings: Env }>()

interface MatchPlanRow {
  id: string
  match_id: string
  user_id: string
  quarter: number
  player_positions: string
}

interface SkippedPlan {
  id: string
  reason: string
}

// POST /migrate/match-plans
// Not Firebase-JWT-guarded — uses X-Migration-Secret header instead.
// Run once by the developer; idempotent (checks for existing sub_events before inserting).
migrate.post('/match-plans', async (c) => {
  const secret = c.req.header('X-Migration-Secret')
  if (!c.env.MIGRATION_SECRET || secret !== c.env.MIGRATION_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const plans = await c.env.DB.prepare('SELECT * FROM match_plans').all()
  if (plans.results.length === 0) {
    return c.json({ plans: 0, migrated: 0, skipped: 0, skippedDetails: [] })
  }

  let migrated = 0
  const skipped: SkippedPlan[] = []

  for (const plan of plans.results as unknown as MatchPlanRow[]) {
    // Idempotency check: if sub_events already exist for this match+period at time 0, skip
    const existing = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM sub_events WHERE match_id = ? AND period = ? AND seconds_elapsed = 0'
    ).bind(plan.match_id, plan.quarter).first<{ count: number }>()

    if (existing && existing.count > 0) {
      skipped.push({ id: plan.id, reason: 'Already migrated (sub_events exist for this match+period)' })
      continue
    }

    let positions: Array<{ playerId: string; position: string }>
    try {
      positions = JSON.parse(plan.player_positions)
    } catch (err: any) {
      skipped.push({ id: plan.id, reason: `JSON parse error: ${err?.message ?? 'unknown'}` })
      continue
    }

    if (!positions || positions.length === 0) {
      skipped.push({ id: plan.id, reason: 'No positions in player_positions JSON' })
      continue
    }

    const inserts = positions.map(pos =>
      c.env.DB.prepare(
        `INSERT INTO sub_events
          (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uuidv4(),
        plan.match_id,
        plan.user_id,
        plan.quarter,
        0,
        pos.playerId,
        pos.position
      )
    )

    try {
      await c.env.DB.batch(inserts)
      migrated += inserts.length
    } catch (err: any) {
      skipped.push({ id: plan.id, reason: `Batch insert error: ${err?.message ?? 'unknown'}` })
    }
  }

  return c.json({
    plans: plans.results.length,
    migrated,
    skipped: skipped.length,
    skippedDetails: skipped,
  })
})

export default migrate
