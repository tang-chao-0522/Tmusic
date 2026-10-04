import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { ROOM_CAPACITY, roomCommandSchema, roomQueueCommandSchema } from '@tmusic/contracts'
import { nanoid } from 'nanoid'
import type { RedisClients } from '../infra/redis'
import { verifyRoomTicket } from '../security/roomSession'
import { RoomError, type RoomService } from '../services/roomService'

function errorAck(error: unknown) {
  return { ok: false, error: error instanceof RoomError ? { code: error.code, message: error.message, retryable: error.status >= 500 || error.status === 409 } : { code: 'ROOM_ERROR', message: '房间操作失败', retryable: true }, serverTime: new Date().toISOString() }
}

export function registerRealtime(io: Server, rooms: RoomService, redis: RedisClients | null) {
  if (redis) io.adapter(createAdapter(redis.pub, redis.sub))
  const consumedTickets = new Map<string, number>()

  io.use(async (socket, next) => {
    const ticket = verifyRoomTicket(String(socket.handshake.auth?.ticket ?? ''))
    if (!ticket) return next(new Error('房间票据无效或已过期'))
    try {
      if (redis) {
        const accepted = await redis.command.set(`room:ticket:${ticket.jti}`, '1', 'EX', 60, 'NX')
        if (accepted !== 'OK') return next(new Error('房间票据已使用'))
      } else {
        if (consumedTickets.has(ticket.jti)) return next(new Error('房间票据已使用'))
        if (consumedTickets.size > 1000) for (const [id, expiry] of consumedTickets) if (expiry < Date.now()) consumedTickets.delete(id)
        consumedTickets.set(ticket.jti, ticket.expiresAt)
      }
      socket.data.ticket = ticket
      next()
    } catch { next(new Error('房间票据校验失败')) }
  })

  io.on('connection', (socket) => {
    const ticket = socket.data.ticket as { userId: string; name: string; roomId: string }
    const roomId = ticket.roomId
    const userId = ticket.userId
    const recentActions = new Map<string, number[]>()
    const checkRate = (kind: string, limit: number) => {
      const now = Date.now()
      const recent = (recentActions.get(kind) ?? []).filter((time) => now - time < 10_000)
      if (recent.length >= limit) throw new RoomError('RATE_LIMITED', '操作太频繁，请稍后再试', 429)
      recent.push(now)
      recentActions.set(kind, recent)
    }
    const checkRoom = (event: any) => {
      if (!event || event.roomId !== roomId || socket.data.joined !== true) throw new RoomError('ROOM_FORBIDDEN', '请先加入房间', 403)
    }

    socket.on('room:join', async (event, ack) => {
      try {
        if (event?.roomId !== roomId) throw new RoomError('ROOM_FORBIDDEN', '房间票据不匹配', 403)
        const existing = await rooms.get(roomId)
        if (!existing?.members.some((member) => member.userId === userId)) throw new RoomError('ROOM_FORBIDDEN', '请先通过加入接口进入房间', 403)
        const room = await rooms.setConnection(roomId, userId, 1)
        await socket.join(roomId)
        socket.data.joined = true
        socket.emit('room:snapshot', { eventId: `evt_${nanoid()}`, roomId, serverTime: new Date().toISOString(), payload: { room: { id: room.id, name: room.name, status: room.status, role: rooms.roleOf(room, userId), ownerId: room.ownerId, maxMembers: ROOM_CAPACITY }, playback: room.playback, queue: room.queue, members: room.members, messages: await rooms.listMessages(room) } })
        io.to(roomId).emit('room:members', { roomId, members: room.members, ownerId: room.ownerId })
        ack?.({ ok: true, data: { roomId }, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('clock:ping', (payload, ack) => ack?.({ clientTime: payload?.clientTime, serverTime: new Date().toISOString() }))

    socket.on('room:ready', async (event, ack) => {
      try {
        checkRoom(event)
        const version = Number(event.payload?.stateVersion)
        const track = String(event.payload?.trackKey ?? '')
        if (!Number.isSafeInteger(version) || !track) throw new RoomError('VALIDATION_ERROR', '准备状态不合法', 422)
        const room = await rooms.markReady(roomId, userId, version, track)
        io.to(roomId).emit('room:members', { roomId, members: room.members, ownerId: room.ownerId })
        ack?.({ ok: true, data: {}, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('playback:command', async (event, ack) => {
      try {
        checkRoom(event)
        checkRate('playback', 20)
        const parsed = roomCommandSchema.safeParse(event.payload)
        if (!parsed.success) throw new RoomError('VALIDATION_ERROR', '播放命令不合法', 422)
        const { room, duplicate } = await rooms.playbackCommand(roomId, userId, parsed.data)
        if (!duplicate) io.to(roomId).emit('playback:state', { eventId: `evt_${nanoid()}`, roomId, serverTime: new Date().toISOString(), payload: room.playback })
        ack?.({ ok: true, data: { stateVersion: room.playback.stateVersion, playback: room.playback }, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('queue:command', async (event, ack) => {
      try {
        checkRoom(event)
        checkRate('queue', 20)
        const parsed = roomQueueCommandSchema.safeParse(event.payload)
        if (!parsed.success) throw new RoomError('VALIDATION_ERROR', '队列命令不合法', 422)
        const { room, duplicate } = await rooms.queueCommand(roomId, userId, parsed.data)
        if (!duplicate) io.to(roomId).emit('queue:updated', { roomId, queue: room.queue, playback: room.playback, serverTime: new Date().toISOString() })
        ack?.({ ok: true, data: { queueVersion: room.playback.queueVersion, queue: room.queue }, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('chat:send', async (event, ack) => {
      try {
        checkRoom(event)
        checkRate('chat', 10)
        const room = await rooms.get(roomId)
        if (!room || room.status !== 'ACTIVE') throw new RoomError('ROOM_ENDED', '房间已结束', 404)
        const clientMessageId = String(event.payload?.clientMessageId ?? '')
        const content = String(event.payload?.text ?? '').trim()
        if (!clientMessageId || clientMessageId.length > 100) throw new RoomError('VALIDATION_ERROR', '消息编号不合法', 422)
        const { message, duplicate } = await rooms.sendMessage(room, userId, ticket.name, clientMessageId, content)
        if (!duplicate) io.to(roomId).emit('chat:message', { roomId, payload: message, serverTime: new Date().toISOString() })
        ack?.({ ok: true, data: { messageId: message.id }, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('room:leave', async (_event, ack) => {
      try {
        const room = await rooms.leave(roomId, userId)
        socket.data.joined = false
        await socket.leave(roomId)
        io.to(roomId).emit('room:members', { roomId, members: room.members, ownerId: room.ownerId })
        if (room.status === 'ENDED') io.to(roomId).emit('room:ended', { roomId, serverTime: new Date().toISOString() })
        ack?.({ ok: true, data: {}, serverTime: new Date().toISOString() })
      } catch (error) { ack?.(errorAck(error)) }
    })

    socket.on('disconnect', () => {
      if (!socket.data.joined) return
      void rooms.setConnection(roomId, userId, -1).then((room) => {
        io.to(roomId).emit('room:members', { roomId, members: room.members, ownerId: room.ownerId })
        setTimeout(() => {
          void (async () => {
            const latest = await rooms.get(roomId)
            const member = latest?.members.find((item) => item.userId === userId)
            if (!member || member.connections > 0 || Date.now() - member.lastSeen < 30_000) return
            const changed = await rooms.leave(roomId, userId)
            io.to(roomId).emit('room:members', { roomId, members: changed.members, ownerId: changed.ownerId })
            if (changed.status === 'ENDED') io.to(roomId).emit('room:ended', { roomId, serverTime: new Date().toISOString() })
          })().catch(() => undefined)
        }, 30_000).unref()
      }).catch(() => undefined)
    })
  })
}
