import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { actorFrom, fail, ok } from '../lib/http'
import type { MusicProvider } from '../providers/musicProvider'
import { getNeteaseCookie } from '../services/credentialService'

const resolveSchema = z.object({ track: z.object({ provider: z.literal('netease'), sourceId: z.string().min(1) }), quality: z.string().default('exhigh'), context: z.record(z.string(), z.unknown()).optional() })

export const playbackRoutes: FastifyPluginAsync<{ provider: MusicProvider }> = async (app, options) => {
  app.get('/playback/lyrics/:sourceId', async (request, reply) => {
    const parsed = z.object({ sourceId: z.string().regex(/^\d+$/) }).safeParse(request.params)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '歌曲 ID 不合法')
    try {
      const lyrics = await options.provider.getLyrics(parsed.data.sourceId)
      reply.header('Cache-Control', 'private, max-age=300')
      return ok(request, lyrics)
    } catch {
      return fail(reply, request, 502, 'LYRICS_UNAVAILABLE', '暂时无法读取歌词', true)
    }
  })

  app.post('/playback/resolve', async (request, reply) => {
    const parsed = resolveSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '播放参数不合法')
    const userId = actorFrom(request)
    try {
      const grant = await options.provider.resolvePlayback(parsed.data.track.sourceId, parsed.data.quality, { userId, serializedCookie: await getNeteaseCookie(userId) })
      if (grant.availability !== 'AVAILABLE') return fail(reply, request, 403, `TRACK_${grant.availability}`, '当前账号无法播放该歌曲')
      reply.header('Cache-Control', 'private, no-store')
      return ok(request, grant)
    } catch {
      return fail(reply, request, 502, 'PROVIDER_UNAVAILABLE', '网易云播放源暂时不可用', true)
    }
  })
}
