import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './auth'
import rosters from './routes/rosters'
import players from './routes/players'
import gameFormats from './routes/game-formats'
import positions from './routes/positions'
import matches from './routes/matches'
import matchPlans from './routes/match-plans'
import tournaments from './routes/tournaments'

export type Env = {
  DB: D1Database
  FIREBASE_PROJECT_ID: string
  ALLOWED_ORIGINS: string
}

export type Variables = {
  userId: string
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// CORS — must be before auth so preflight OPTIONS requests pass through
app.use('/api/*', async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  const corsMiddleware = cors({
    origin: allowedOrigins,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
  return corsMiddleware(c, next)
})

// Auth — all /api/* routes require a valid Firebase ID token
app.use('/api/*', authMiddleware)

// Routes
app.route('/api/rosters', rosters)
app.route('/api/rosters/:rosterId/players', players)
app.route('/api/players', players)
app.route('/api/game-formats', gameFormats)
app.route('/api/positions', positions)
app.route('/api/matches', matches)
app.route('/api/matches/:matchId/plans', matchPlans)
app.route('/api/match-plans', matchPlans)
app.route('/api/tournaments', tournaments)

// Health check (no auth)
app.get('/', (c) => c.json({ ok: true, service: 'netball-roster-tracker' }))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
