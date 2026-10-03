import type { FastifyPluginAsync } from 'fastify'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { isMongoReady } from '../infra/mongo'
import { actorFrom, fail, ok } from '../lib/http'
import { CommentModel } from '../models/Comment'
import type { MusicProvider } from '../providers/musicProvider'

const memoryComments: Array<Record<string, any>> = []
const createSchema = z.object({ target: z.discriminatedUnion('type', [z.object({ type: z.literal('TRACK'), provider: z.string(), sourceId: z.string() }), z.object({ type: z.literal('PLAYLIST'), id: z.string() })]), content: z.string().trim().min(1).max(500), parentId: z.string().nullable().optional() })
const keyOf = (target: any) => target.type === 'TRACK' ? `track:${target.provider}:${target.sourceId}` : `playlist:${target.id}`

export const commentRoutes: FastifyPluginAsync<{ provider: MusicProvider }> = async (app, options) => {
  app.get('/comments', async (request, reply) => {
    const query = request.query as Record<string, string>
    const targetKey = query.targetType === 'TRACK' ? `track:${query.provider}:${query.targetId}` : `playlist:${query.targetId}`
    const items = isMongoReady() ? await CommentModel.find({ targetKey, status: { $ne: 'HIDDEN' } }).sort({ createdAt: -1 }).limit(30).lean() : memoryComments.filter((item) => item.targetKey === targetKey).slice(-30).reverse()
    return ok(request, items, { nextCursor: null, hasMore: false })
  })

  app.post('/comments', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '评论内容不合法')
    const publicId = `cmt_${nanoid(14)}`
    const item = { publicId, targetKey: keyOf(parsed.data.target), authorId: actorFrom(request), authorName: '澪', rootId: parsed.data.parentId ?? publicId, parentId: parsed.data.parentId ?? null, content: parsed.data.content, status: 'VISIBLE', likeCount: 0, replyCount: 0, createdAt: new Date() }
    if (isMongoReady()) await CommentModel.create(item)
    else memoryComments.push(item)
    return reply.status(201).send(ok(request, item))
  })

  app.get('/catalog/:kind/:provider/:sourceId/comments', async (request, reply) => {
    const params = request.params as { kind: string; provider: string; sourceId: string }
    if (params.provider !== 'netease' || !['tracks', 'playlists'].includes(params.kind)) return fail(reply, request, 404, 'NOT_FOUND', '评论来源不存在')
    try {
      const result = await options.provider.getComments(params.kind === 'tracks' ? 'track' : 'playlist', params.sourceId, (request.query as any).cursor)
      return ok(request, result.items, { nextCursor: result.nextCursor, hasMore: result.hasMore, source: 'netease', fetchedAt: result.fetchedAt })
    } catch { return fail(reply, request, 502, 'PROVIDER_UNAVAILABLE', '网易云评论暂时不可用', true) }
  })
}
