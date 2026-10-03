import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const roomMessageSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    roomId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    clientMessageId: { type: String, required: true },
    type: { type: String, enum: ['TEXT', 'TRACK'], default: 'TEXT' },
    text: { type: String, maxlength: 500 },
    track: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true },
)

roomMessageSchema.index({ roomId: 1, senderId: 1, clientMessageId: 1 }, { unique: true })
roomMessageSchema.index({ roomId: 1, createdAt: -1 })

export const RoomMessageModel: Model<any> = (models.RoomMessage as Model<any>) || model('RoomMessage', roomMessageSchema)
