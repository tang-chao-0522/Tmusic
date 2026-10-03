import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { actorFrom, fail, ok } from '../lib/http'
import type { NeteaseProvider } from '../providers/neteaseProvider'
import { getNeteaseCookie, hasNeteaseCredential, removeNeteaseCookie, saveNeteaseCookie } from '../services/credentialService'

const checkSchema = z.object({ key: z.string().min(8).max(256) })

export const neteaseAuthRoutes: FastifyPluginAsync<{ provider: NeteaseProvider }> = async (app, options) => {
  app.get('/providers/netease/health', async (request, reply) => {
    try {
      return ok(request, await options.provider.health())
    } catch {
      return fail(reply, request, 502, 'NETEASE_API_UNAVAILABLE', 'NeteaseCloudMusicApi 无法连接', true)
    }
  })

  app.post('/auth/netease/qr', async (request, reply) => {
    try {
      return ok(request, await options.provider.createQrLogin())
    } catch {
      return fail(reply, request, 502, 'NETEASE_QR_CREATE_FAILED', '无法创建网易云登录二维码', true)
    }
  })

  app.get('/auth/netease/qr/status', async (request, reply) => {
    const parsed = checkSchema.safeParse(request.query)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '二维码 key 不合法')
    try {
      const result = await options.provider.checkQrLogin(parsed.data.key)
      if (result.code === 803) {
        if (!result.cookie) return fail(reply, request, 502, 'NETEASE_COOKIE_MISSING', '扫码成功但未取得登录凭据', true)
        await saveNeteaseCookie(actorFrom(request), result.cookie)
      }
      return ok(request, { code: result.code, message: result.message ?? '', authenticated: result.code === 803 })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease QR status failed')
      return fail(reply, request, 502, 'NETEASE_QR_CHECK_FAILED', '无法检查扫码状态', true)
    }
  })

  app.get('/auth/netease/status', async (request, reply) => {
    const userId = actorFrom(request)
    const cookie = await getNeteaseCookie(userId)
    if (!cookie) return ok(request, { authenticated: false, account: null, profile: null })
    try {
      const status = await options.provider.loginStatus(cookie)
      const account = status.data?.account ?? status.account ?? null
      const profile = status.data?.profile ?? status.profile ?? null
      return ok(request, { authenticated: Boolean(account), account, profile, credentialStored: await hasNeteaseCredential(userId) })
    } catch {
      return fail(reply, request, 502, 'NETEASE_STATUS_FAILED', '无法读取网易云登录状态', true)
    }
  })

  app.delete('/auth/netease/session', async (request) => {
    const userId = actorFrom(request)
    const cookie = await getNeteaseCookie(userId)
    if (cookie) await options.provider.logout(cookie).catch(() => undefined)
    await removeNeteaseCookie(userId)
    return ok(request, { authenticated: false })
  })
}
