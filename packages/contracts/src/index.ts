import { z } from 'zod'

export const trackRefSchema = z.object({
  provider: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  artists: z.array(z.object({ sourceId: z.string(), name: z.string() })),
  album: z
    .object({ sourceId: z.string(), name: z.string(), coverUrl: z.string().nullable() })
    .nullable(),
  durationMs: z.number().int().nonnegative(),
  coverUrl: z.string().nullable(),
  availability: z
    .enum(['AVAILABLE', 'LOGIN_REQUIRED', 'VIP_REQUIRED', 'REGION_BLOCKED', 'UNAVAILABLE', 'UNKNOWN'])
    .default('UNKNOWN'),
})

export type TrackRef = z.infer<typeof trackRefSchema>

export const ROOM_CAPACITY = 2

export const createRoomSchema = z.object({
  initialQueue: z.array(trackRefSchema).max(500).default([]),
}).strict()

export type CreateRoomInput = z.infer<typeof createRoomSchema>

export const playbackStateSchema = z.object({
  stateVersion: z.number().int().nonnegative(),
  track: trackRefSchema.nullable(),
  isPlaying: z.boolean(),
  positionMs: z.number().int().nonnegative(),
  startedAt: z.string().datetime().nullable(),
  serverTime: z.string().datetime(),
  queueVersion: z.number().int().nonnegative(),
  repeatMode: z.enum(['OFF', 'QUEUE', 'ONE']),
})

export type PlaybackState = z.infer<typeof playbackStateSchema>

export const chatMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  clientMessageId: z.string(),
  sender: z.object({ id: z.string(), displayName: z.string(), avatarUrl: z.string().nullable() }),
  type: z.enum(['TEXT', 'TRACK']),
  text: z.string().max(500).optional(),
  track: trackRefSchema.optional(),
  createdAt: z.string().datetime(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

export const roomCommandSchema = z.object({
  commandId: z.string().min(1).max(100),
  knownStateVersion: z.number().int().nonnegative(),
  type: z.enum(['PLAY', 'PAUSE', 'SEEK', 'NEXT', 'PREVIOUS', 'PLAY_TRACK']),
  positionMs: z.number().int().nonnegative().optional(),
  track: trackRefSchema.optional(),
})
export type RoomCommand = z.infer<typeof roomCommandSchema>

export const roomQueueCommandSchema = z.object({
  commandId: z.string().min(1).max(100),
  knownQueueVersion: z.number().int().nonnegative(),
  type: z.enum(['ADD', 'REMOVE', 'MOVE', 'ADD_AND_PLAY']),
  track: trackRefSchema.optional(),
  tracks: z.array(trackRefSchema).max(500).optional(),
  index: z.number().int().nonnegative().optional(),
  toIndex: z.number().int().nonnegative().optional(),
})
export type RoomQueueCommand = z.infer<typeof roomQueueCommandSchema>

export type CommentSource = 'tmusic' | 'netease'

export type ApiEnvelope<T> = {
  data: T
  meta: { requestId: string; nextCursor?: string | null; hasMore?: boolean }
}

export type ApiErrorEnvelope = {
  error: { code: string; message: string; details?: unknown; retryable: boolean }
  meta: { requestId: string }
}
