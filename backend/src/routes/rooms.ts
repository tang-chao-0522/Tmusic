import type { FastifyPluginAsync } from 'fastify'
import { createRoomSchema } from '@tmusic/contracts'
import { nanoid } from 'nanoid'
import { actorFrom, fail, ok } from '../lib/http'
import type { RoomService } from '../services/roomService'

export const roomRoutes: FastifyPluginAsync<{ rooms: RoomService }> = async (app, options) => {
  app.post('/rooms', async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '房间设置不合法')
    const room = await options.rooms.create(parsed.data, actorFrom(request))
    return reply.status(201).send(ok(request, { id: room.id, joinCode: nanoid(6).toUpperCase(), shareUrl: `${request.protocol}://${request.host}/room/${room.id}`, status: room.status, role: 'HOST', settings: room.settings }))
  })

  app.get('/rooms/:roomId/snapshot', async (request, reply) => {
    const room = await options.rooms.get((request.params as { roomId: string }).roomId)
    if (!room || room.status === 'ENDED') return fail(reply, request, 404, 'ROOM_ENDED', '房间不存在或已结束')
    return ok(request, { room: { id: room.id, name: room.name, status: room.status, role: room.ownerId === actorFrom(request) ? 'HOST' : 'MEMBER', settings: room.settings }, playback: { ...room.playback, serverTime: new Date().toISOString() }, queue: room.queue, members: [], realtimeTicket: `dev_${nanoid(20)}` })
  })

  app.post('/rooms/:roomId/end', async (request, reply) => {
    const roomId = (request.params as { roomId: string }).roomId
    const room = await options.rooms.get(roomId)
    if (!room) return fail(reply, request, 404, 'NOT_FOUND', '房间不存在')
    if (room.ownerId !== actorFrom(request)) return fail(reply, request, 403, 'ROOM_FORBIDDEN', '只有房主可以结束房间')
    await options.rooms.end(roomId)
    return reply.status(204).send()
  })
}
