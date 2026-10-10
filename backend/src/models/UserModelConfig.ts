import mongoose, { Schema } from 'mongoose'

export type UserModelConfigRecord = {
  accountId: string
  provider: 'openai-compatible' | 'anthropic-compatible'
  baseUrl: string
  model: string
  apiKeyCiphertext: string
  apiKeyIv: string
  apiKeyAuthTag: string
  apiKeyLast4: string
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<UserModelConfigRecord>({
  accountId: { type: String, required: true, unique: true },
  provider: { type: String, required: true },
  baseUrl: { type: String, required: true },
  model: { type: String, required: true },
  apiKeyCiphertext: { type: String, required: true, select: false },
  apiKeyIv: { type: String, required: true, select: false },
  apiKeyAuthTag: { type: String, required: true, select: false },
  apiKeyLast4: { type: String, required: true },
}, { timestamps: true })

export const UserModelConfigModel = mongoose.models.UserModelConfig as mongoose.Model<UserModelConfigRecord> || mongoose.model<UserModelConfigRecord>('UserModelConfig', schema)
