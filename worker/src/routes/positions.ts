import { Hono } from 'hono'
import type { Env, Variables } from '../index'

const positions = new Hono<{ Bindings: Env; Variables: Variables }>()

positions.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const body = await c.req.json<{ name?: string; abbreviation?: string; icon?: string }>()

  const result = await c.env.DB.prepare(`
    UPDATE positions SET
      name = COALESCE(?, name),
      abbreviation = COALESCE(?, abbreviation),
      icon = COALESCE(?, icon)
    WHERE id = ? AND user_id = ?
  `).bind(body.name ?? null, body.abbreviation ?? null, body.icon ?? null, id, userId).run()

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

positions.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  const result = await c.env.DB.prepare(
    'DELETE FROM positions WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ id })
})

export default positions
