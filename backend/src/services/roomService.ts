import { createRoomSchema, type CreateRoomInput, type PlaybackState, type RoomSettings, type TrackRef } from '@tmusic/contracts'
import { nanoid } from 'nanoid'
import type { RedisClients } from '../infra/redis'
import { isMongoReady } from '../infra/mongo'
import { RoomModel } from '../models/Room'

export type ActiveRoom = {
  id: string
  ownerId: string
  name: string
  visibility: 'PUBLIC' | 'PASSWORD' | 'INVITE_ONLY'
  maxMembers: number
  status: 'ACTIVE' | 'ENDED'
  settings: RoomSettings
  queue: TrackRef[]
  playback: PlaybackState
}

const memoryRooms = new Map<string, ActiveRoom>()

export class RoomService {
  constructor(private readonly redis: RedisClients | null) {}

  async create(input: CreateRoomInput, ownerId: string) {
    const data = createRoomSchema.parse(input)
    const now = new Date().toISOString()
    const room: ActiveRoom = {
      id: `room_${nanoid(14)}`, ownerId, name: data.name, visibility: data.visibility,
      maxMembers: data.maxMembers, status: 'ACTIVE', settings: data.settings, queue: data.initialQueue,
      playback: { stateVersion: 0, track: data.initialQueue[0] ?? null, isPlaying: false, positionMs: 0, startedAt: null, serverTime: now, queueVersion: data.initialQueue.length ? 1 : 0, repeatMode: 'QUEUE' },
    }
    memoryRooms.set(room.id, room)
    if (this.redis) await this.redis.command.set(`room:${room.id}:state`, JSON.stringify(room), 'EX', 86_400)
    if (isMongoReady()) await RoomModel.create({ publicId: room.id, ownerId, name: room.name, visibility: room.visibility, maxMembers: room.maxMembers, settings: room.settings })
    return room
  }

  async get(roomId: string) {
    if (this.redis) {
      const raw = await this.redis.command.get(`room:${roomId}:state`)
      if (raw) return JSON.parse(raw) as ActiveRoom
    }
    return memoryRooms.get(roomId) ?? null
  }

  async save(room: ActiveRoom) {
    memoryRooms.set(room.id, room)
    if (this.redis) await this.redis.command.set(`room:${room.id}:state`, JSON.stringify(room), 'EX', 86_400)
  }

  async end(roomId: string) {
    const room = await this.get(roomId)
    if (!room) return null
    room.status = 'ENDED'
    await this.save(room)
    if (this.redis && room.settings.messageRetention === 'EPHEMERAL') {
      await this.redis.command.del(`room:${roomId}:messages`, `room:${roomId}:dedupe`)
    }
    if (isMongoReady()) await RoomModel.updateOne({ publicId: roomId }, { status: 'ENDED' })
    return room
  }
}
