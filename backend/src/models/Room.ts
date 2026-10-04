import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const roomSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 60 },
    status: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE', index: true },
  },
  { timestamps: true },
)

export const RoomModel: Model<any> = (models.Room as Model<any>) || model('Room', roomSchema)
