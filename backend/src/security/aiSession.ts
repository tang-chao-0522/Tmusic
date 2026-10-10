import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { env } from '../config/env'

const secret = env.AI_SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex'))
type AiSession = { accountId: string; credentialOwnerId: string; expiresAt: number }

export function createAiSession(accountId: string, credentialOwnerId: string) {
  if (!secret) throw new Error('AI_SESSION_SECRET is required in production')
  const body = Buffer.from(JSON.stringify({ accountId, credentialOwnerId, expiresAt: Date.now() + 30 * 86400_000 } satisfies AiSession)).toString('base64url')
  const mac = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function aiSessionFrom(request: FastifyRequest): AiSession | null {
  if (!secret) return null
  const token = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('tmusic_ai_session='))?.slice('tmusic_ai_session='.length)
  if (!token) return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  try {
    const expected = createHmac('sha256', secret).update(body).digest()
    const actual = Buffer.from(mac, 'base64url')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as AiSession
    return typeof value.accountId === 'string' && typeof value.credentialOwnerId === 'string' && value.expiresAt > Date.now() ? value : null
  } catch { return null }
}

export function aiSessionCookie(token: string) {
  return `tmusic_ai_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export function clearAiSessionCookie() {
  return `tmusic_ai_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.NODE_ENV === 'production' ? '; Secure' : ''}`
}
