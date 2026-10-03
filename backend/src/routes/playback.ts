import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { actorFrom, fail, ok } from '../lib/http'
import type { MusicProvider } from '../providers/musicProvider'
import { getNeteaseCookie } from '../services/credentialService'

const resolveSchema = z.object({ track: z.object({ provider: z.literal('netease'), sourceId: z.string().min(1) }), quality: z.string().default('exhigh'), context: z.record(z.string(), z.unknown()).optional() })

export const playbackRoutes: FastifyPluginAsync<{ provider: MusicProvider }> = async (app, options) => {
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
