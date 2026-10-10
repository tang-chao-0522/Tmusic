import mongoose, { Schema } from 'mongoose'

export type AiConversationRecord = {
  publicId: string
  accountId: string
  credentialOwnerId: string
  piConversationId: number
  title: string
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<AiConversationRecord>({
  publicId: { type: String, required: true, unique: true },
  accountId: { type: String, required: true, index: true },
  credentialOwnerId: { type: String, required: true },
  piConversationId: { type: Number, required: true, unique: true },
  title: { type: String, required: true, default: '新对话' },
  archived: { type: Boolean, required: true, default: false },
}, { timestamps: true })

schema.index({ accountId: 1, updatedAt: -1 })
export const AiConversationModel = mongoose.models.AiConversation as mongoose.Model<AiConversationRecord> || mongoose.model<AiConversationRecord>('AiConversation', schema)
