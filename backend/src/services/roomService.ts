import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createRoomSchema, type ChatMessage, type CreateRoomInput, type PlaybackState, type RoomCommand, type RoomQueueCommand, type RoomSettings, type TrackRef } from '@tmusic/contracts'
import { nanoid } from 'nanoid'
import type { RedisClients } from '../infra/redis'
import { isMongoReady } from '../infra/mongo'
import { RoomModel } from '../models/Room'
import { RoomMessageModel } from '../models/RoomMessage'
import { RoomAuditModel } from '../models/RoomAudit'
import { env } from '../config/env'

export type RoomMember = { userId: string; name: string; connections: number; lastSeen: number; ready: boolean }
export type ActiveRoom = {
  id: string; ownerId: string; name: string; visibility: 'PUBLIC' | 'PASSWORD' | 'INVITE_ONLY'
  inviteHash: string; passwordSalt?: string; passwordHash?: string
  maxMembers: number; status: 'ACTIVE' | 'ENDED'; settings: RoomSettings
  queue: TrackRef[]; playback: PlaybackState; members: RoomMember[]; coHostIds: string[]
}

const memoryRooms = new Map<string, ActiveRoom>()
const memoryCommands = new Map<string, number>()
const memoryMessages = new Map<string, ChatMessage[]>()
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const same = (a: string, b: string) => {
  const first = Buffer.from(a), second = Buffer.from(b)
  return first.length === second.length && timingSafeEqual(first, second)
}
const trackKey = (track: TrackRef) => `${track.provider}:${track.sourceId}`
const validTrack = (track: TrackRef) => track.provider === 'netease' && /^\d+$/.test(track.sourceId)

export class RoomError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export class RoomService {
  constructor(private readonly redis: RedisClients | null) {}

  private async recordAudit(room: ActiveRoom, action: string, actorId: string, targetId?: string, changes?: object) {
    if (!isMongoReady()) return
    try {
      await RoomAuditModel.create({ roomId: room.id, action, actorId, targetId, changes })
    } catch (error) { console.error('Room audit write failed', error) }
  }

  roleOf(room: ActiveRoom, userId: string): 'HOST' | 'CO_HOST' | 'MEMBER' {
    return room.ownerId === userId ? 'HOST' : (room.coHostIds ?? []).includes(userId) ? 'CO_HOST' : 'MEMBER'
  }

  private canControl(room: ActiveRoom, userId: string) {
    return room.ownerId === userId || (room.settings.controlMode === 'CO_HOST' && (room.coHostIds ?? []).includes(userId))
  }

  async setCoHost(roomId: string, ownerId: string, targetId: string, enabled: boolean) {
    const room = (await this.update(roomId, (room) => {
      if (room.ownerId !== ownerId) throw new RoomError('ROOM_FORBIDDEN', '只有房主可以设置协作者', 403)
      if (targetId === ownerId || !room.members.some((member) => member.userId === targetId)) throw new RoomError('MEMBER_INVALID', '请选择房间内的其他成员', 422)
      room.coHostIds ??= []
      room.coHostIds = enabled ? [...new Set([...room.coHostIds, targetId])] : room.coHostIds.filter((id) => id !== targetId)
    })).room
    await this.recordAudit(room, enabled ? 'CO_HOST_GRANTED' : 'CO_HOST_REVOKED', ownerId, targetId)
    return room
  }

  async updateSettings(roomId: string, ownerId: string, changes: Partial<Pick<RoomSettings, 'controlMode' | 'allowTrackRequests' | 'chatEnabled'> & { maxMembers: number }>) {
    const room = (await this.update(roomId, (room) => {
      if (room.ownerId !== ownerId) throw new RoomError('ROOM_FORBIDDEN', '只有房主可以修改房间设置', 403)
      if (changes.maxMembers !== undefined && changes.maxMembers < room.members.length) throw new RoomError('ROOM_CAPACITY_INVALID', '人数上限不能小于当前成员数', 422)
      const { maxMembers: _maxMembers, ...settings } = changes
      room.settings = { ...room.settings, ...settings }
      if (changes.maxMembers !== undefined) room.maxMembers = changes.maxMembers
    })).room
    if (isMongoReady()) await RoomModel.updateOne({ publicId: roomId }, { settings: room.settings, maxMembers: room.maxMembers }).catch((error: unknown) => console.error('Room metadata write failed', error))
    await this.recordAudit(room, 'SETTINGS', ownerId, undefined, changes)
    return room
  }

  async rotateInvite(roomId: string, ownerId: string) {
    const inviteCode = randomBytes(18).toString('base64url')
    const room = (await this.update(roomId, (room) => {
      if (room.ownerId !== ownerId) throw new RoomError('ROOM_FORBIDDEN', '只有房主可以重置邀请链接', 403)
      if (room.visibility !== 'INVITE_ONLY') throw new RoomError('ROOM_INVALID', '当前房间不使用邀请链接', 422)
      room.inviteHash = hash(inviteCode)
    })).room
    await this.recordAudit(room, 'INVITE_ROTATED', ownerId)
    return { room, inviteCode }
  }

  private requireReady() {
    if (env.NODE_ENV === 'production' && this.redis?.command.status !== 'ready') throw new RoomError('ROOM_UNAVAILABLE', '房间服务暂不可用', 503)
  }

  async create(input: CreateRoomInput, ownerId: string, ownerName: string) {
    this.requireReady()
    const data = createRoomSchema.parse(input)
    if (data.initialQueue.some((track) => !validTrack(track))) throw new RoomError('TRACK_INVALID', '房间队列中包含无效歌曲', 422)
    if (data.visibility === 'PASSWORD' && !data.password) throw new RoomError('PASSWORD_REQUIRED', '请输入房间口令', 422)
    const inviteCode = randomBytes(18).toString('base64url')
    const passwordSalt = data.password ? randomBytes(16).toString('hex') : undefined
    const now = new Date().toISOString()
    const room: ActiveRoom = {
      id: `room_${nanoid(14)}`, ownerId, name: data.name, visibility: data.visibility,
      inviteHash: hash(inviteCode), passwordSalt,
      passwordHash: data.password && passwordSalt ? scryptSync(data.password, passwordSalt, 32).toString('hex') : undefined,
      maxMembers: data.maxMembers, status: 'ACTIVE', settings: data.settings, queue: data.initialQueue,
      members: [{ userId: ownerId, name: ownerName, connections: 0, lastSeen: Date.now(), ready: false }], coHostIds: [],
      playback: { stateVersion: 0, track: data.initialQueue[0] ?? null, isPlaying: false, positionMs: 0, startedAt: null, serverTime: now, queueVersion: data.initialQueue.length ? 1 : 0, repeatMode: 'QUEUE' },
    }
    await this.save(room)
    if (isMongoReady()) await RoomModel.create({ publicId: room.id, ownerId, name: room.name, visibility: room.visibility, maxMembers: room.maxMembers, settings: room.settings })
    await this.recordAudit(room, 'CREATE', ownerId)
    return { room, inviteCode }
  }

  async get(roomId: string) {
    this.requireReady()
    if (this.redis) {
      const raw = await this.redis.command.get(`room:${roomId}:state`)
      return raw ? JSON.parse(raw) as ActiveRoom : null
    }
    return memoryRooms.get(roomId) ?? null
  }

  async listPublic() {
    this.requireReady()
    const ids = isMongoReady()
      ? (await RoomModel.find({ visibility: 'PUBLIC', status: 'ACTIVE' }).sort({ createdAt: -1 }).limit(30).select('publicId').lean()).map((item: any) => item.publicId as string)
      : [...memoryRooms.values()].filter((room) => room.visibility === 'PUBLIC' && room.status === 'ACTIVE').map((room) => room.id)
    const rooms = await Promise.all(ids.map((id) => this.get(id)))
    return rooms.filter((room): room is ActiveRoom => Boolean(room && room.status === 'ACTIVE' && room.visibility === 'PUBLIC')).map((room) => ({ id: room.id, name: room.name, members: room.members.length, maxMembers: room.maxMembers, trackName: room.playback.track?.name ?? null }))
  }

  async save(room: ActiveRoom) {
    memoryRooms.set(room.id, room)
    if (this.redis) await this.redis.command.set(`room:${room.id}:state`, JSON.stringify(room), 'EX', 86_400)
  }

  private async update(roomId: string, change: (room: ActiveRoom) => void, commandId?: string) {
    this.requireReady()
    const key = `room:${roomId}:state`
    const dedupeKey = commandId ? `room:${roomId}:command:${commandId}` : ''
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.get(roomId)
      if (!current || current.status !== 'ACTIVE') throw new RoomError('ROOM_ENDED', '房间不存在或已结束', 404)
      if (dedupeKey && (this.redis ? await this.redis.command.exists(dedupeKey) : memoryCommands.has(dedupeKey))) return { room: current, duplicate: true }
      const next = structuredClone(current)
      change(next)
      if (!this.redis) {
        if (memoryRooms.get(roomId) !== current) continue
        memoryRooms.set(roomId, next)
        if (dedupeKey) memoryCommands.set(dedupeKey, Date.now())
        return { room: next, duplicate: false }
      }
      const script = `if KEYS[2] ~= '' and redis.call('EXISTS',KEYS[2]) == 1 then return 2 end
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'EX',86400)
if KEYS[2] ~= '' then redis.call('SET',KEYS[2],'1','EX',86400) end
return 1`
      const result = Number(await this.redis.command.eval(script, 2, key, dedupeKey, JSON.stringify(current), JSON.stringify(next)))
      if (result === 2) return { room: current, duplicate: true }
      if (result === 1) { memoryRooms.set(roomId, next); return { room: next, duplicate: false } }
    }
    throw new RoomError('VERSION_CONFLICT', '房间状态已更新，请重试', 409)
  }

  async join(roomId: string, userId: string, name: string, inviteCode?: string, password?: string) {
    return (await this.update(roomId, (room) => {
      const existing = room.members.find((member) => member.userId === userId)
      if (!existing) {
        if (room.members.length >= room.maxMembers) throw new RoomError('ROOM_FULL', '房间人数已满', 403)
        if (room.visibility === 'INVITE_ONLY' && !same(hash(inviteCode ?? ''), room.inviteHash)) throw new RoomError('INVITE_REQUIRED', '邀请链接无效', 403)
        if (room.visibility === 'PASSWORD' && (!room.passwordSalt || !room.passwordHash || !same(scryptSync(password ?? '', room.passwordSalt, 32).toString('hex'), room.passwordHash))) throw new RoomError('PASSWORD_INVALID', '房间口令错误', 403)
        room.members.push({ userId, name, connections: 0, lastSeen: Date.now(), ready: false })
      } else { existing.name = name; existing.lastSeen = Date.now() }
    })).room
  }

  async setConnection(roomId: string, userId: string, delta: number) {
    return (await this.update(roomId, (room) => {
      const member = room.members.find((item) => item.userId === userId)
      if (!member) throw new RoomError('ROOM_FORBIDDEN', '请先加入房间', 403)
      member.connections = Math.max(0, member.connections + delta)
      member.lastSeen = Date.now()
      if (delta > 0) member.ready = false
    })).room
  }

  async markReady(roomId: string, userId: string, stateVersion: number, track: string) {
    return (await this.update(roomId, (room) => {
      if (room.playback.stateVersion !== stateVersion || !room.playback.track || trackKey(room.playback.track) !== track) throw new RoomError('VERSION_CONFLICT', '歌曲已切换', 409)
      const member = room.members.find((item) => item.userId === userId)
      if (!member) throw new RoomError('ROOM_FORBIDDEN', '请先加入房间', 403)
      member.ready = true
    })).room
  }

  async leave(roomId: string, userId: string) {
    const previousOwner = (await this.get(roomId))?.ownerId
    const room = (await this.update(roomId, (room) => {
      room.members = room.members.filter((member) => member.userId !== userId)
      room.coHostIds = (room.coHostIds ?? []).filter((id) => id !== userId)
      if (room.ownerId === userId) {
        const nextOwner = room.members.find((member) => room.coHostIds.includes(member.userId)) ?? room.members[0]
        if (nextOwner) { room.ownerId = nextOwner.userId; room.coHostIds = room.coHostIds.filter((id) => id !== nextOwner.userId) }
        else { room.status = 'ENDED'; room.playback.isPlaying = false; room.playback.startedAt = null }
      }
    })).room
    if (previousOwner === userId && room.ownerId !== userId && room.status === 'ACTIVE') {
      if (isMongoReady()) await RoomModel.updateOne({ publicId: roomId }, { ownerId: room.ownerId }).catch((error: unknown) => console.error('Room metadata write failed', error))
      await this.recordAudit(room, 'HOST_TRANSFERRED', userId, room.ownerId)
    }
    if (room.status === 'ENDED') {
      await this.recordAudit(room, 'ENDED', userId)
      if (this.redis && room.settings.messageRetention === 'EPHEMERAL') await this.redis.command.del(`room:${roomId}:messages`)
      memoryMessages.delete(roomId)
      if (isMongoReady()) await RoomModel.updateOne({ publicId: roomId }, { status: 'ENDED' })
    }
    return room
  }

  async playbackCommand(roomId: string, userId: string, command: RoomCommand) {
    return this.update(roomId, (room) => {
      if (!this.canControl(room, userId)) throw new RoomError('ROOM_FORBIDDEN', '没有控制播放的权限', 403)
      if (command.knownStateVersion !== room.playback.stateVersion) throw new RoomError('VERSION_CONFLICT', '播放状态已更新，请同步后重试', 409)
      const state = room.playback
      const now = Date.now()
      const elapsed = state.isPlaying && state.startedAt ? Math.max(0, now - Date.parse(state.startedAt)) : 0
      const currentPosition = Math.min(state.track?.durationMs ?? Infinity, state.positionMs + elapsed)
      let position = currentPosition
      let track = state.track
      let playing = state.isPlaying
      if (command.type === 'PLAY' && !track) throw new RoomError('QUEUE_EMPTY', '房间队列还没有歌曲', 422)
      if (command.type === 'SEEK' && command.positionMs === undefined) throw new RoomError('VALIDATION_ERROR', '缺少播放位置', 422)
      if (command.type === 'PLAY') { playing = true; position = command.positionMs ?? currentPosition }
      if (command.type === 'PAUSE') playing = false
      if (command.type === 'SEEK') position = command.positionMs ?? currentPosition
      if (command.type === 'NEXT' || command.type === 'PREVIOUS') {
        const index = room.queue.findIndex((item) => track && trackKey(item) === trackKey(track))
        const next = command.type === 'NEXT' ? (index + 1) % room.queue.length : (index <= 0 ? room.queue.length - 1 : index - 1)
        track = room.queue[next] ?? track
        position = 0
        room.members.forEach((member) => { member.ready = false })
      }
      if (command.type === 'PLAY_TRACK') {
        const chosen = command.track && room.queue.find((item) => trackKey(item) === trackKey(command.track!))
        if (!chosen) throw new RoomError('TRACK_NOT_IN_QUEUE', '歌曲不在房间队列中', 422)
        track = chosen
        position = 0
        playing = true
        room.members.forEach((member) => { member.ready = false })
      }
      state.track = track
      state.positionMs = Math.max(0, Math.min(position, track?.durationMs ?? position))
      state.isPlaying = Boolean(track && playing)
      state.startedAt = state.isPlaying ? new Date(now).toISOString() : null
      state.serverTime = new Date(now).toISOString()
      state.stateVersion++
    }, command.commandId)
  }

  async queueCommand(roomId: string, userId: string, command: RoomQueueCommand) {
    return this.update(roomId, (room) => {
      if (command.knownQueueVersion !== room.playback.queueVersion) throw new RoomError('VERSION_CONFLICT', '队列已更新，请同步后重试', 409)
      if (!this.canControl(room, userId) && !(room.members.some((member) => member.userId === userId) && room.settings.allowTrackRequests && command.type === 'ADD')) throw new RoomError('ROOM_FORBIDDEN', '没有修改队列权限', 403)
      if (command.type === 'ADD') {
        if (!command.track || !validTrack(command.track) || room.queue.length >= 500) throw new RoomError('QUEUE_INVALID', '无法添加歌曲', 422)
        room.queue.push(command.track)
        if (!room.playback.track) room.playback.track = command.track
      }
      if (command.type === 'REMOVE') {
        if (command.index === undefined || command.index >= room.queue.length) throw new RoomError('QUEUE_INVALID', '歌曲序号无效', 422)
        const removed = room.queue.splice(command.index, 1)[0]
        if (removed && room.playback.track && trackKey(removed) === trackKey(room.playback.track)) {
          room.playback.track = room.queue[0] ?? null; room.playback.positionMs = 0; room.playback.stateVersion++
          room.playback.startedAt = room.playback.isPlaying && room.playback.track ? new Date().toISOString() : null
        }
      }
      if (command.type === 'MOVE') {
        if (command.index === undefined || command.toIndex === undefined || command.index >= room.queue.length || command.toIndex >= room.queue.length) throw new RoomError('QUEUE_INVALID', '歌曲序号无效', 422)
        const item = room.queue.splice(command.index, 1)[0]!
        room.queue.splice(command.toIndex, 0, item)
      }
      room.playback.queueVersion++
      room.playback.serverTime = new Date().toISOString()
    }, command.commandId)
  }

  async end(roomId: string, ownerId: string) {
    const room = (await this.update(roomId, (next) => {
      if (next.ownerId !== ownerId) throw new RoomError('ROOM_FORBIDDEN', '只有房主可以结束房间', 403)
      next.status = 'ENDED'; next.playback.isPlaying = false; next.playback.startedAt = null
    })).room
    await this.recordAudit(room, 'ENDED', ownerId)
    if (this.redis && room.settings.messageRetention === 'EPHEMERAL') await this.redis.command.del(`room:${roomId}:messages`)
    if (room.settings.messageRetention === 'EPHEMERAL') memoryMessages.delete(roomId)
    if (isMongoReady()) await RoomModel.updateOne({ publicId: roomId }, { status: 'ENDED' })
    return room
  }

  async listMessages(room: ActiveRoom): Promise<ChatMessage[]> {
    if (room.settings.messageRetention === 'PERSISTENT' && isMongoReady()) {
      const docs = await RoomMessageModel.find({ roomId: room.id }).sort({ createdAt: -1 }).limit(50).lean()
      return docs.reverse().map((doc: any) => ({ id: doc.publicId, roomId: room.id, clientMessageId: doc.clientMessageId, sender: { id: doc.senderId, displayName: doc.senderName, avatarUrl: null }, type: doc.type, text: doc.text, createdAt: doc.createdAt.toISOString() }))
    }
    if (this.redis) {
      const items = await this.redis.command.lrange(`room:${room.id}:messages`, -50, -1)
      return items.map((item) => JSON.parse(item) as ChatMessage)
    }
    return memoryMessages.get(room.id) ?? []
  }

  async sendMessage(room: ActiveRoom, userId: string, name: string, clientMessageId: string, text: string) {
    if (!room.members.some((member) => member.userId === userId)) throw new RoomError('ROOM_FORBIDDEN', '请先加入房间', 403)
    if (!room.settings.chatEnabled || !text.trim() || text.length > 500) throw new RoomError('VALIDATION_ERROR', '消息不可发送', 422)
    const existing = (await this.listMessages(room)).find((item) => item.sender.id === userId && item.clientMessageId === clientMessageId)
    if (existing) return { message: existing, duplicate: true }
    const message: ChatMessage = { id: `msg_${nanoid(14)}`, roomId: room.id, clientMessageId, sender: { id: userId, displayName: name, avatarUrl: null }, type: 'TEXT', text: text.trim(), createdAt: new Date().toISOString() }
    if (room.settings.messageRetention === 'PERSISTENT') {
      if (!isMongoReady()) throw new RoomError('STORAGE_UNAVAILABLE', '聊天存储暂不可用', 503)
      try {
        await RoomMessageModel.create({ publicId: message.id, roomId: room.id, senderId: userId, senderName: name, clientMessageId, type: 'TEXT', text: message.text, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
        const prior = await RoomMessageModel.findOne({ roomId: room.id, senderId: userId, clientMessageId }).lean()
        if (!prior) throw error
        return { message: { ...message, id: prior.publicId, text: prior.text, createdAt: prior.createdAt.toISOString() }, duplicate: true }
      }
    } else if (this.redis) {
      const key = `room:${room.id}:messages`
      const dedupeKey = `room:${room.id}:message:${hash(`${userId}:${clientMessageId}`)}`
      const prior = await this.redis.command.eval(`local prior=redis.call('GET',KEYS[2])
if prior then return prior end
redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('LTRIM',KEYS[1],-100,-1); redis.call('EXPIRE',KEYS[1],86400)
redis.call('SET',KEYS[2],ARGV[1],'EX',86400)
return ''`, 2, key, dedupeKey, JSON.stringify(message))
      if (prior) return { message: JSON.parse(String(prior)) as ChatMessage, duplicate: true }
    } else {
      const items = memoryMessages.get(room.id) ?? []
      memoryMessages.set(room.id, [...items, message].slice(-100))
    }
    return { message, duplicate: false }
  }
}
