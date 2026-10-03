import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const roomAuditSchema = new Schema({
  roomId: { type: String, required: true, index: true },
  action: { type: String, enum: ['CREATE', 'SETTINGS', 'CO_HOST_GRANTED', 'CO_HOST_REVOKED', 'INVITE_ROTATED', 'HOST_TRANSFERRED', 'ENDED'], required: true },
  actorId: { type: String, required: true },
  targetId: { type: String },
  changes: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 90 * 24 * 60 * 60 },
})

export const RoomAuditModel: Model<any> = (models.RoomAudit as Model<any>) || model('RoomAudit', roomAuditSchema)
