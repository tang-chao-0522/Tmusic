import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { env } from '../config/env'

const secret = env.ROOM_SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex'))
if (!secret) throw new Error('ROOM_SESSION_SECRET is required in production')

type Session = { userId: string; name: string; expiresAt: number }
type Ticket = Session & { roomId: string; jti: string }

function sign(value: object) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url')
  const mac = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verify<T>(token: string | undefined): T | null {
  if (!token) return null
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(mac, 'base64url') } catch { return null }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { expiresAt: number }
    return value.expiresAt > Date.now() ? value : null
  } catch { return null }
}

export function sessionFrom(request: FastifyRequest): Session | null {
  const cookies = request.headers.cookie?.split(';').map((part) => part.trim()) ?? []
  const token = cookies.find((part) => part.startsWith('tmusic_room_session='))?.slice('tmusic_room_session='.length)
  return verify<Session>(token)
}

export function newSession() {
  const session: Session = { userId: `guest_${randomBytes(16).toString('hex')}`, name: '访客', expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }
  return { session, token: sign(session) }
}

export function sessionCookie(token: string) {
  return `tmusic_room_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export function createRoomTicket(session: Session, roomId: string) {
  return sign({ ...session, roomId, jti: randomBytes(16).toString('hex'), expiresAt: Date.now() + 60_000 })
}

export function verifyRoomTicket(token: string | undefined): Ticket | null {
  return verify<Ticket>(token)
}
