import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { Server } from 'socket.io'
import { createRoomSchema } from '@tmusic/contracts'
import { ROOM_CAPACITY } from '@tmusic/contracts'
import { env } from '../config/env'
import { fail, ok } from '../lib/http'
import { createRoomTicket, newSession, sessionCookie, sessionFrom } from '../security/roomSession'
import { RoomError, type ActiveRoom, type RoomService } from '../services/roomService'

function roomView(room: ActiveRoom, userId: string) {
  return { id: room.id, name: room.name, status: room.status, role: room.ownerId === userId ? 'HOST' : 'MEMBER', ownerId: room.ownerId, maxMembers: ROOM_CAPACITY }
}

function sameOrigin(request: FastifyRequest) {
  return !request.headers.origin || request.headers.origin === env.WEB_ORIGIN
}

export const roomRoutes: FastifyPluginAsync<{ rooms: RoomService; io: Server }> = async (app, options) => {
  app.post('/rooms/session', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const current = sessionFrom(request)
    if (current) return ok(request, { userId: current.userId, name: current.name })
    const { session, token } = newSession()
    reply.header('Set-Cookie', sessionCookie(token))
    return ok(request, { userId: session.userId, name: session.name })
  })

  app.post('/rooms', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const session = sessionFrom(request)
    if (!session) return fail(reply, request, 401, 'SESSION_REQUIRED', '请先建立房间会话')
    const parsed = createRoomSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '房间歌曲不合法')
    try {
      const { room, inviteCode } = await options.rooms.create(parsed.data, session.userId, session.name)
      return reply.status(201).send(ok(request, { id: room.id, inviteCode, shareUrl: `${env.WEB_ORIGIN}/room/${room.id}?code=${encodeURIComponent(inviteCode)}`, status: room.status, role: 'HOST' }))
    } catch (error) {
      if (error instanceof RoomError) return fail(reply, request, error.status, error.code, error.message)
      throw error
    }
  })

  app.post('/rooms/:roomId/join', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const session = sessionFrom(request)
    if (!session) return fail(reply, request, 401, 'SESSION_REQUIRED', '请先建立房间会话')
    const roomId = (request.params as { roomId: string }).roomId
    const query = (request.body ?? {}) as { code?: string }
    try {
      const room = await options.rooms.join(roomId, session.userId, session.name, query.code)
      return ok(request, { room: roomView(room, session.userId), playback: { ...room.playback, serverTime: new Date().toISOString() }, queue: room.queue, members: room.members, messages: await options.rooms.listMessages(room), realtimeTicket: createRoomTicket(session, room.id) })
    } catch (error) {
      if (error instanceof RoomError) return fail(reply, request, error.status, error.code, error.message)
      throw error
    }
  })

  app.get('/rooms/:roomId/snapshot', async (request, reply) => {
    const session = sessionFrom(request)
    if (!session) return fail(reply, request, 401, 'SESSION_REQUIRED', '请先建立房间会话')
    const room = await options.rooms.get((request.params as { roomId: string }).roomId)
    if (!room || room.status !== 'ACTIVE') return fail(reply, request, 404, 'ROOM_ENDED', '房间不存在或已结束')
    if (!room.members.some((member) => member.userId === session.userId)) return fail(reply, request, 403, 'ROOM_FORBIDDEN', '请先加入房间')
    return ok(request, { room: roomView(room, session.userId), playback: { ...room.playback, serverTime: new Date().toISOString() }, queue: room.queue, members: room.members, messages: await options.rooms.listMessages(room), realtimeTicket: createRoomTicket(session, room.id) })
  })

  app.post('/rooms/:roomId/leave', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const session = sessionFrom(request)
    if (!session) return fail(reply, request, 401, 'SESSION_REQUIRED', '请先建立房间会话')
    const roomId = (request.params as { roomId: string }).roomId
    try {
      const room = await options.rooms.leave(roomId, session.userId)
      options.io.to(roomId).emit('room:members', { roomId, members: room.members, ownerId: room.ownerId })
      if (room.status === 'ENDED') options.io.to(roomId).emit('room:ended', { roomId, serverTime: new Date().toISOString() })
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof RoomError) return fail(reply, request, error.status, error.code, error.message)
      throw error
    }
  })

  app.post('/rooms/:roomId/end', async (request, reply) => {
    if (!sameOrigin(request)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const session = sessionFrom(request)
    if (!session) return fail(reply, request, 401, 'SESSION_REQUIRED', '请先建立房间会话')
    const roomId = (request.params as { roomId: string }).roomId
    try {
      await options.rooms.end(roomId, session.userId)
      options.io.to(roomId).emit('room:ended', { roomId, serverTime: new Date().toISOString() })
      return reply.status(204).send()
    } catch (error) { if (error instanceof RoomError) return fail(reply, request, error.status, error.code, error.message); throw error }
  })

}
