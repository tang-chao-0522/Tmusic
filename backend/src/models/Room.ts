import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const roomSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    visibility: { type: String, enum: ['PUBLIC', 'PASSWORD', 'INVITE_ONLY'], required: true },
    status: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE', index: true },
    maxMembers: { type: Number, default: 20 },
    settings: {
      controlMode: { type: String, enum: ['HOST_ONLY', 'CO_HOST'], default: 'HOST_ONLY' },
      allowTrackRequests: { type: Boolean, default: true },
      chatEnabled: { type: Boolean, default: true },
      messageRetention: { type: String, enum: ['PERSISTENT', 'EPHEMERAL'], default: 'EPHEMERAL' },
    },
  },
  { timestamps: true },
)

export const RoomModel: Model<any> = (models.Room as Model<any>) || model('Room', roomSchema)
