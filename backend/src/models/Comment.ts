import mongoose, { type Model } from 'mongoose'

const { Schema, model, models } = mongoose

const commentSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    targetKey: { type: String, required: true, index: true },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    rootId: { type: String, required: true, index: true },
    parentId: { type: String, default: null },
    content: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['VISIBLE', 'DELETED', 'HIDDEN'], default: 'VISIBLE' },
    likeCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

commentSchema.index({ targetKey: 1, status: 1, createdAt: -1 })

export const CommentModel: Model<any> = (models.Comment as Model<any>) || model('Comment', commentSchema)
