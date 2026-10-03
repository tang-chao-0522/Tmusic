import type { FastifyPluginAsync } from 'fastify'
import { demoCatalogTracks, demoPlaylists } from '../data/demoCatalog'
import { fail, ok } from '../lib/http'
import type { NeteaseProvider } from '../providers/neteaseProvider'

export const catalogRoutes: FastifyPluginAsync<{ provider: NeteaseProvider }> = async (app, options) => {
  app.get('/catalog/home', async (request) => {
    try {
      const live = await options.provider.getHomeCatalog()
      return ok(request, { ...live, degraded: false })
    } catch {
      return ok(request, {
        hero: demoCatalogTracks[0],
        continueListening: demoCatalogTracks.slice(0, 2),
        quickPicks: demoCatalogTracks.slice(2, 6),
        recommendations: demoCatalogTracks,
        playlists: demoPlaylists,
        degraded: true,
        message: '网易云服务暂不可用，当前展示本地演示内容',
      })
    }
  })

  app.get('/catalog/search', async (request, reply) => {
    const query = request.query as { q?: string; type?: string; limit?: string; offset?: string }
    const keyword = query.q?.trim() ?? ''
    const limit = query.limit === undefined ? 30 : Number(query.limit)
    const offset = query.offset === undefined ? 0 : Number(query.offset)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
      return fail(reply, request, 422, 'VALIDATION_ERROR', '分页参数不合法')
    }
    if (!keyword) return ok(request, { tracks: [], degraded: false }, { total: 0, hasMore: false, nextCursor: null })
    try {
      const { tracks, total } = await options.provider.searchTracks(keyword, limit, offset)
      const nextOffset = offset + tracks.length
      const hasMore = tracks.length > 0 && nextOffset < total
      return ok(request, { tracks, degraded: false }, { total, hasMore, nextCursor: hasMore ? String(nextOffset) : null })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease search unavailable')
      return fail(reply, request, 502, 'NETEASE_SEARCH_UNAVAILABLE', '网易云搜索暂时不可用，请检查播放源服务', true)
    }
  })

  app.get('/me/playlists', async (request) => {
    try {
      const items = await options.provider.getRecommendedPlaylists()
      if (items.length) return ok(request, { featured: items[0], items, degraded: false })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease playlists unavailable')
    }
    return ok(request, { featured: demoPlaylists[0], items: demoPlaylists, degraded: true })
  })

  app.get('/catalog/tracks/:provider/:sourceId', async (request) => {
    const { sourceId } = request.params as { sourceId: string }
    const track = demoCatalogTracks.find((item) => item.sourceId === sourceId) ?? demoCatalogTracks[0]
    return ok(request, track)
  })
}
