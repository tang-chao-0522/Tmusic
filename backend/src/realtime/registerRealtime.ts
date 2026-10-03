import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { nanoid } from 'nanoid'
import type { ChatMessage } from '@tmusic/contracts'
import type { RedisClients } from '../infra/redis'
import { isMongoReady } from '../infra/mongo'
import { RoomMessageModel } from '../models/RoomMessage'
import type { RoomService } from '../services/roomService'

type SocketUser = { id: string; displayName: string }

export function registerRealtime(io: Server, rooms: RoomService, redis: RedisClients | null) {
  if (redis) io.adapter(createAdapter(redis.pub, redis.sub))

  io.use((socket, next) => {
    const userId = String(socket.handshake.auth?.userId || 'dev-user')
    socket.data.user = { id: userId, displayName: String(socket.handshake.auth?.displayName || '澪') } satisfies SocketUser
    next()
  })

  io.on('connection', (socket) => {
    socket.on('room:join', async (event, ack) => {
      const room = await rooms.get(event.roomId)
      if (!room || room.status !== 'ACTIVE') return ack?.({ ok: false, error: { code: 'ROOM_ENDED', message: '房间已结束', retryable: false }, serverTime: new Date().toISOString() })
      await socket.join(room.id)
      socket.data.roomId = room.id
      socket.emit('room:snapshot', { eventId: `evt_${nanoid()}`, roomId: room.id, serverTime: new Date().toISOString(), payload: room })
      socket.to(room.id).emit('room:member_joined', { eventId: `evt_${nanoid()}`, roomId: room.id, serverTime: new Date().toISOString(), payload: socket.data.user })
      ack?.({ ok: true, data: { roomId: room.id }, serverTime: new Date().toISOString() })
    })

    socket.on('clock:ping', (payload, ack) => ack?.({ clientTime: payload.clientTime, serverTime: new Date().toISOString() }))

    socket.on('playback:command', async (event, ack) => {
      const room = await rooms.get(event.roomId)
      const user = socket.data.user as SocketUser
      if (!room) return ack?.({ ok: false, error: { code: 'ROOM_ENDED', message: '房间已结束', retryable: false }, serverTime: new Date().toISOString() })
      if (room.ownerId !== user.id) return ack?.({ ok: false, error: { code: 'ROOM_FORBIDDEN', message: '没有播放控制权限', retryable: false }, serverTime: new Date().toISOString() })
      if (event.payload.knownStateVersion !== room.playback.stateVersion) return ack?.({ ok: false, error: { code: 'VERSION_CONFLICT', message: '播放状态已更新', retryable: true }, serverTime: new Date().toISOString() })
      const now = new Date().toISOString()
      const command = event.payload
      room.playback = {
        ...room.playback,
        stateVersion: room.playback.stateVersion + 1,
        isPlaying: command.type === 'PLAY' ? true : command.type === 'PAUSE' ? false : room.playback.isPlaying,
        positionMs: typeof command.positionMs === 'number' ? Math.max(0, command.positionMs) : room.playback.positionMs,
        startedAt: command.type === 'PLAY' ? now : command.type === 'PAUSE' ? null : room.playback.startedAt,
        serverTime: now,
      }
      await rooms.save(room)
      const serverEvent = { eventId: `evt_${nanoid()}`, roomId: room.id, serverTime: now, payload: { ...room.playback, causedByCommandId: command.commandId, actor: user } }
      io.to(room.id).emit('playback:state', serverEvent)
      ack?.({ ok: true, data: { stateVersion: room.playback.stateVersion }, serverTime: now })
    })

    socket.on('chat:send', async (event, ack) => {
      const room = await rooms.get(event.roomId)
      const user = socket.data.user as SocketUser
      const text = String(event.payload?.text ?? '').trim()
      if (!room || !room.settings.chatEnabled || !text || text.length > 500) return ack?.({ ok: false, error: { code: 'VALIDATION_ERROR', message: '消息不可发送', retryable: false }, serverTime: new Date().toISOString() })
      const message: ChatMessage = { id: `msg_${nanoid(14)}`, roomId: room.id, clientMessageId: String(event.payload.clientMessageId), sender: { id: user.id, displayName: user.displayName, avatarUrl: null }, type: 'TEXT', text, createdAt: new Date().toISOString() }
      if (room.settings.messageRetention === 'PERSISTENT' && isMongoReady()) {
        await RoomMessageModel.create({ publicId: message.id, roomId: room.id, senderId: user.id, senderName: user.displayName, clientMessageId: message.clientMessageId, type: 'TEXT', text })
      } else if (redis) {
        await redis.command.rpush(`room:${room.id}:messages`, JSON.stringify(message))
        await redis.command.ltrim(`room:${room.id}:messages`, -100, -1)
        await redis.command.expire(`room:${room.id}:messages`, 86_400)
      }
      const serverEvent = { eventId: `evt_${nanoid()}`, roomId: room.id, serverTime: new Date().toISOString(), payload: message }
      io.to(room.id).emit('chat:message', serverEvent)
      ack?.({ ok: true, data: { messageId: message.id }, serverTime: serverEvent.serverTime })
    })

    socket.on('disconnect', () => {
      if (socket.data.roomId) socket.to(socket.data.roomId).emit('room:member_left', { eventId: `evt_${nanoid()}`, roomId: socket.data.roomId, serverTime: new Date().toISOString(), payload: socket.data.user })
    })
  })
}
