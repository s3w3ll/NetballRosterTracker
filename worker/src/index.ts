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
const FALLBACK_ORIGINS = 'https://s3w3ll.github.io,http://localhost:9002'
const getAllowedOrigins = (env: Env) =>
  (env.ALLOWED_ORIGINS ?? FALLBACK_ORIGINS).split(',').map((o) => o.trim())

app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: getAllowedOrigins(c.env),
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
  // Ensure CORS headers are present on error responses so the browser
  // doesn't block them before the client can read the error status.
  const origin = c.req.header('origin') ?? ''
  if (getAllowedOrigins(c.env).includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
