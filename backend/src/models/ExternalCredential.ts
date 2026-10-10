import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const externalCredentialSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true },
    accountId: { type: String },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, default: 1 },
    expiresAt: { type: Date },
    lastValidatedAt: { type: Date },
  },
  { timestamps: true },
)

externalCredentialSchema.index({ userId: 1, provider: 1 }, { unique: true })

export const ExternalCredentialModel: Model<any> = (models.ExternalCredential as Model<any>) || model('ExternalCredential', externalCredentialSchema)
