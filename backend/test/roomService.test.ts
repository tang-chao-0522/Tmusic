import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CreateRoomInput, TrackRef } from '@tmusic/contracts'
import { RoomError, RoomService } from '../src/services/roomService'

const track: TrackRef = { provider: 'netease', sourceId: '1974443814', name: '测试歌曲', artists: [{ sourceId: '1', name: '测试歌手' }], album: null, durationMs: 240_000, coverUrl: null, availability: 'UNKNOWN' }
const input: CreateRoomInput = { initialQueue: [track] }

test('room invitation, permissions, command deduplication and queue versions', async () => {
  const rooms = new RoomService(null)
  const { room, inviteCode } = await rooms.create(input, 'host', '房主')
  await assert.rejects(rooms.join(room.id, 'guest', '成员'), (error: unknown) => error instanceof RoomError && error.code === 'INVITE_REQUIRED')
  await rooms.join(room.id, 'guest', '成员', inviteCode)
  await assert.rejects(rooms.join(room.id, 'third', '第三人', inviteCode), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FULL')
  await assert.rejects(rooms.leave(room.id, 'third'), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')
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

test('host transfer and temporary chat in a two-person room', async () => {
  const rooms = new RoomService(null)
  const { room, inviteCode } = await rooms.create(input, 'owner-2', '房主')
  await rooms.join(room.id, 'listener-2', '听众', inviteCode)
  await assert.rejects(rooms.playbackCommand(room.id, 'listener-2', { commandId: 'listener-play', knownStateVersion: 0, type: 'PLAY' }), (error: unknown) => error instanceof RoomError && error.code === 'ROOM_FORBIDDEN')
  const first = await rooms.sendMessage((await rooms.get(room.id))!, 'listener-2', '听众', 'message-1', '你好')
  const duplicate = await rooms.sendMessage((await rooms.get(room.id))!, 'listener-2', '听众', 'message-1', '你好')
  assert.equal(duplicate.duplicate, true)
  assert.equal(first.message.id, duplicate.message.id)
  await rooms.leave(room.id, 'owner-2')
  assert.equal((await rooms.get(room.id))?.ownerId, 'listener-2')
  assert.equal(rooms.roleOf((await rooms.get(room.id))!, 'listener-2'), 'HOST')
  const started = await rooms.playbackCommand(room.id, 'listener-2', { commandId: 'new-host-play', knownStateVersion: 0, type: 'PLAY' })
  assert.equal(started.room.playback.isPlaying, true)
  await rooms.end(room.id, 'listener-2')
  assert.deepEqual(await rooms.listMessages((await rooms.get(room.id))!), [])
})
