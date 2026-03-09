import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Context, Next } from 'hono'
import type { Env } from './index'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
)

export async function verifyFirebaseToken(token: string, projectId: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })
  if (!payload.sub) throw new Error('Missing sub claim')
  return payload.sub
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const userId = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
    c.set('userId', userId)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
