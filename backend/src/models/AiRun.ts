import mongoose, { Schema } from 'mongoose'

export type AiEvent = { sequence: number; type: string; data: Record<string, unknown>; createdAt: string }
export type AiRunRecord = {
  publicId: string
  messageId: string
  conversationId: string
  accountId: string
  clientMessageId: string
  submissionId?: string
  userText: string
  requestedTrackCount: number
  wantsPlaylist: boolean
  candidateSourceIds: string[]
  answerText: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  eventSequence: number
  events: AiEvent[]
  cards: Array<Record<string, unknown>>
  plan: Record<string, unknown> | null
  steps: Array<Record<string, unknown>>
  errorCode?: string
  createdAt: Date
  updatedAt: Date
}

const eventSchema = new Schema<AiEvent>({ sequence: Number, type: String, data: Schema.Types.Mixed, createdAt: String }, { _id: false })
const schema = new Schema<AiRunRecord>({
  publicId: { type: String, required: true, unique: true },
  messageId: { type: String, required: true, unique: true },
  conversationId: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  clientMessageId: { type: String, required: true },
  submissionId: { type: String },
  userText: { type: String, required: true },
  requestedTrackCount: { type: Number, default: 0 },
  wantsPlaylist: { type: Boolean, default: false },
  candidateSourceIds: { type: [String], default: [] },
  answerText: { type: String, default: '' },
  status: { type: String, required: true, default: 'QUEUED' },
  eventSequence: { type: Number, default: 0 },
  events: { type: [eventSchema], default: [] },
  cards: { type: [Schema.Types.Mixed], default: [] } as any,
  plan: { type: Schema.Types.Mixed, default: null },
  steps: { type: [Schema.Types.Mixed], default: [] } as any,
  errorCode: String,
}, { timestamps: true })

schema.index({ conversationId: 1, clientMessageId: 1 }, { unique: true })
schema.index({ conversationId: 1 }, { name: 'active_ai_run_per_conversation', unique: true, partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING'] } } })
export const AiRunModel = mongoose.models.AiRun as mongoose.Model<AiRunRecord> || mongoose.model<AiRunRecord>('AiRun', schema)
