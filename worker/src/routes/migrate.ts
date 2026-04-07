import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import type { Env } from '../index'

const migrate = new Hono<{ Bindings: Env }>()

// POST /migrate/match-plans
// Not Firebase-JWT-guarded — uses X-Migration-Secret header instead.
// Run once by the developer; idempotent via INSERT OR IGNORE.
migrate.post('/match-plans', async (c) => {
  const secret = c.req.header('X-Migration-Secret')
  if (!c.env.MIGRATION_SECRET || secret !== c.env.MIGRATION_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const plans = await c.env.DB.prepare('SELECT * FROM match_plans').all()
  if (plans.results.length === 0) {
    return c.json({ plans: 0, migrated: 0, skipped: 0 })
  }

  let migrated = 0
  let skipped = 0

  for (const plan of plans.results as any[]) {
    let positions: Array<{ playerId: string; position: string }>
    try {
      positions = JSON.parse(plan.player_positions as string)
    } catch {
      skipped++
      continue
    }

    if (!positions || positions.length === 0) {
      skipped++
      continue
    }

    const inserts = positions.map(pos =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO sub_events
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

    await c.env.DB.batch(inserts)
    migrated += inserts.length
  }

  return c.json({ plans: plans.results.length, migrated, skipped })
})

export default migrate
