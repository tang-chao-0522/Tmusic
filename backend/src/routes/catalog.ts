import type { FastifyPluginAsync } from 'fastify'
import { demoCatalogTracks, demoPlaylists } from '../data/demoCatalog'
import { fail, ok } from '../lib/http'
import { actorFrom } from '../lib/http'
import type { CatalogSearchType, NeteaseProvider } from '../providers/neteaseProvider'
import { getNeteaseCookie } from '../services/credentialService'

export const catalogRoutes: FastifyPluginAsync<{ provider: NeteaseProvider }> = async (app, options) => {
  app.get('/catalog/home', async (request) => {
    try {
      const live = await options.provider.getHomeCatalog(await getNeteaseCookie(actorFrom(request)))
      return ok(request, { ...live, degraded: false })
    } catch {
      return ok(request, {
        hero: demoCatalogTracks[0],
        guessYouLike: demoCatalogTracks.slice(0, 2),
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
    const type = (query.type ?? 'song') as CatalogSearchType
    const limit = query.limit === undefined ? 30 : Number(query.limit)
    const offset = query.offset === undefined ? 0 : Number(query.offset)
    if (!['song', 'playlist', 'artist', 'album'].includes(type) || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
      return fail(reply, request, 422, 'VALIDATION_ERROR', '分页参数不合法')
    }
    if (!keyword) return ok(request, { type, items: [], degraded: false }, { total: 0, hasMore: false, nextCursor: null })
    try {
      const { items, total } = await options.provider.searchCatalog(type, keyword, limit, offset)
      const nextOffset = offset + items.length
      const hasMore = items.length > 0 && nextOffset < total
      return ok(request, { type, items, degraded: false }, { total, hasMore, nextCursor: hasMore ? String(nextOffset) : null })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease search unavailable')
      return fail(reply, request, 502, 'NETEASE_SEARCH_UNAVAILABLE', '网易云搜索暂时不可用，请检查播放源服务', true)
    }
  })

  app.get('/me/library', async (request, reply) => {
    const query = request.query as { type?: string; offset?: string; limit?: string }
    const type = query.type ?? 'playlist'
    if (!['playlist', 'liked', 'album', 'artist'].includes(type)) return fail(reply, request, 422, 'VALIDATION_ERROR', '音乐库分类不合法')
    const paged = query.offset !== undefined || query.limit !== undefined
    const offset = Number(query.offset ?? 0)
    const limit = Number(query.limit ?? 40)
    if (paged && (type !== 'liked' || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)) return fail(reply, request, 422, 'VALIDATION_ERROR', '分页参数不合法')
    const cookie = await getNeteaseCookie(actorFrom(request))
    if (!cookie) return fail(reply, request, 401, 'NETEASE_LOGIN_REQUIRED', '请先连接网易云音乐账号')
    try {
      if (paged) {
        const page = await options.provider.getLikedTracksPage(cookie, offset, limit)
        return ok(request, { type, items: page.items }, { total: page.total, hasMore: page.nextOffset !== null, nextCursor: page.nextOffset === null ? null : String(page.nextOffset) })
      }
      const items = await options.provider.getUserLibrary(type as 'playlist' | 'liked' | 'album' | 'artist', cookie)
      return ok(request, { type, items })
    } catch (error) {
      request.log.warn({ err: error, type }, 'Netease user library unavailable')
      if (error instanceof Error && error.message === 'Netease login is required') {
        return fail(reply, request, 401, 'NETEASE_LOGIN_EXPIRED', '网易云登录已失效，请重新扫码连接')
      }
      return fail(reply, request, 502, 'NETEASE_LIBRARY_UNAVAILABLE', '暂时无法读取网易云个人音乐库', true)
    }
  })

  app.get('/me/playlists', async (request) => {
    try {
      const cookie = await getNeteaseCookie(actorFrom(request))
      const items = cookie ? await options.provider.getUserLibrary('playlist', cookie) : await options.provider.getRecommendedPlaylists()
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
