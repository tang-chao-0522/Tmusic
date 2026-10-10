import mongoose, { Schema } from 'mongoose'
import type { TrackRef } from '@tmusic/contracts'

export type PlaylistDraftRecord = {
  publicId: string
  accountId: string
  conversationId: string
  name: string
  tracks: TrackRef[]
  version: number
  status: 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'NEEDS_RECONCILIATION'
  sourceTaskId?: string
  publishedPlaylistId?: string
  publishKey?: string
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<PlaylistDraftRecord>({
  publicId: { type: String, required: true, unique: true },
  accountId: { type: String, required: true, index: true },
  conversationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  tracks: { type: [Schema.Types.Mixed], default: [] } as any,
  version: { type: Number, required: true, default: 1 },
  status: { type: String, required: true, default: 'DRAFT' },
  sourceTaskId: { type: String, unique: true, sparse: true },
  publishedPlaylistId: String,
  publishKey: String,
}, { timestamps: true })

export const PlaylistDraftModel = mongoose.models.PlaylistDraft as mongoose.Model<PlaylistDraftRecord> || mongoose.model<PlaylistDraftRecord>('PlaylistDraft', schema)
