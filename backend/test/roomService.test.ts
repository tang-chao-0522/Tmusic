import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CreateRoomInput, TrackRef } from '@tmusic/contracts'
import { RoomError, RoomService } from '../src/services/roomService'

const track: TrackRef = { provider: 'netease', sourceId: '1974443814', name: '测试歌曲', artists: [{ sourceId: '1', name: '测试歌手' }], album: null, durationMs: 240_000, coverUrl: null, availability: 'UNKNOWN' }
const input: CreateRoomInput = { name: '一起听测试', visibility: 'INVITE_ONLY', maxMembers: 2, settings: { controlMode: 'HOST_ONLY', allowTrackRequests: true, chatEnabled: true, messageRetention: 'EPHEMERAL' }, initialQueue: [track] }

test('room invitation, permissions, command deduplication and queue versions', async () => {
  const rooms = new RoomService(null)
  const { room, inviteCode } = await rooms.create(input, 'host', '房主')
  await assert.rejects(rooms.join(room.id, 'guest', '成员'), (error: unknown) => error instanceof RoomError && error.code === 'INVITE_REQUIRED')
  await rooms.join(room.id, 'guest', '成员', inviteCode)
  await assert.rejects(rooms.join(room.id, 'third', '第三人', inviteCode), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FULL')
  await assert.rejects(rooms.playbackCommand(room.id, 'guest', { commandId: 'guest-play', knownStateVersion: 0, type: 'PLAY' }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')

  const started = await rooms.playbackCommand(room.id, 'host', { commandId: 'play-1', knownStateVersion: 0, type: 'PLAY' })
  assert.equal(started.room.playback.stateVersion, 1)
  assert.equal(started.room.playback.isPlaying, true)
  const repeated = await rooms.playbackCommand(room.id, 'host', { commandId: 'play-1', knownStateVersion: 0, type: 'PLAY' })
  assert.equal(repeated.duplicate, true)
  assert.equal(repeated.room.playback.stateVersion, 1)
  await assert.rejects(rooms.playbackCommand(room.id, 'host', { commandId: 'stale', knownStateVersion: 0, type: 'PAUSE' }), (error: unknown) => error instanceof RoomError && error.code === 'VERSION_CONFLICT')

  const queued = await rooms.queueCommand(room.id, 'guest', { commandId: 'add-1', knownQueueVersion: 1, type: 'ADD', track: { ...track, sourceId: '1974443815' } })
  assert.equal(queued.room.playback.queueVersion, 2)
  assert.equal(queued.room.queue.length, 2)
  await assert.rejects(rooms.queueCommand(room.id, 'guest', { commandId: 'remove-1', knownQueueVersion: 2, type: 'REMOVE', index: 0 }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')

  const paused = await rooms.playbackCommand(room.id, 'host', { commandId: 'pause-1', knownStateVersion: 1, type: 'PAUSE' })
  assert.equal(paused.room.playback.isPlaying, false)
  assert.equal(paused.room.playback.startedAt, null)
  assert.ok(paused.room.playback.positionMs >= 0)
})

test('co-host permissions, live settings, invite rotation and host transfer', async () => {
  const rooms = new RoomService(null)
  const { room, inviteCode } = await rooms.create({ ...input, maxMembers: 4 }, 'owner-2', '房主')
  await rooms.join(room.id, 'listener-2', '听众', inviteCode)
  await rooms.join(room.id, 'helper-2', '协作者', inviteCode)
  await assert.rejects(rooms.setCoHost(room.id, 'listener-2', 'helper-2', true), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')
  await rooms.setCoHost(room.id, 'owner-2', 'helper-2', true)
  assert.equal(rooms.roleOf((await rooms.get(room.id))!, 'helper-2'), 'CO_HOST')
  await assert.rejects(rooms.playbackCommand(room.id, 'helper-2', { commandId: 'helper-before', knownStateVersion: 0, type: 'PLAY' }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')
  await assert.rejects(rooms.updateSettings(room.id, 'owner-2', { controlMode: 'CO_HOST', allowTrackRequests: false, chatEnabled: false, maxMembers: 2 }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_CAPACITY_INVALID')
  await rooms.updateSettings(room.id, 'owner-2', { controlMode: 'CO_HOST', allowTrackRequests: false, chatEnabled: false, maxMembers: 4 })
  const started = await rooms.playbackCommand(room.id, 'helper-2', { commandId: 'helper-after', knownStateVersion: 0, type: 'PLAY' })
  assert.equal(started.room.playback.isPlaying, true)
  await assert.rejects(rooms.queueCommand(room.id, 'listener-2', { commandId: 'listener-add', knownQueueVersion: 1, type: 'ADD', track }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')
  const nextInvite = await rooms.rotateInvite(room.id, 'owner-2')
  await assert.rejects(rooms.join(room.id, 'new-2', '新成员', inviteCode), (error: unknown) => error instanceof RoomError && error.code === 'INVITE_REQUIRED')
  await rooms.join(room.id, 'new-2', '新成员', nextInvite.inviteCode)
  await rooms.leave(room.id, 'owner-2')
  assert.equal((await rooms.get(room.id))?.ownerId, 'helper-2')
  assert.equal(rooms.roleOf((await rooms.get(room.id))!, 'helper-2'), 'HOST')
})
