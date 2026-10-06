import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { actorFrom, fail, ok } from '../lib/http'
import { isAuthenticatedNeteaseAccount, type NeteaseProvider } from '../providers/neteaseProvider'
import { getNeteaseCookie, hasNeteaseCredential, removeNeteaseCookie, saveNeteaseCookie } from '../services/credentialService'

const checkSchema = z.object({ key: z.string().min(8).max(256) })
const phoneSchema = z.object({ phone: z.string().regex(/^1[3-9]\d{9}$/) }).strict()
const phoneLoginSchema = phoneSchema.extend({ captcha: z.string().regex(/^\d{4,8}$/) })
const captchaSentAt = new Map<string, number>()

export const neteaseAuthRoutes: FastifyPluginAsync<{ provider: NeteaseProvider }> = async (app, options) => {
  app.post('/auth/netease/phone/captcha', async (request, reply) => {
    const parsed = phoneSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '请输入有效的中国大陆手机号')
    const key = `${request.ip}:${parsed.data.phone}`
    const now = Date.now()
    if (now - (captchaSentAt.get(key) ?? 0) < 60_000) return fail(reply, request, 429, 'CAPTCHA_RATE_LIMITED', '请等待 60 秒后重试')
    try {
      const result = await options.provider.sendPhoneCaptcha(parsed.data.phone)
      if (result.code !== 200) return fail(reply, request, 502, 'NETEASE_CAPTCHA_FAILED', result.message || '验证码发送失败', true)
      captchaSentAt.set(key, now)
      for (const [entry, sentAt] of captchaSentAt) if (now - sentAt > 60_000) captchaSentAt.delete(entry)
      return ok(request, { sent: true, retryAfterSeconds: 60 })
    } catch { return fail(reply, request, 502, 'NETEASE_CAPTCHA_FAILED', '验证码发送失败，请稍后重试', true) }
  })

  app.post('/auth/netease/phone/login', async (request, reply) => {
    const parsed = phoneLoginSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '手机号或验证码格式不正确')
    try {
      const result = await options.provider.loginWithPhoneCaptcha(parsed.data.phone, parsed.data.captcha)
      if (result.code !== 200 || !result.cookie) return fail(reply, request, 401, 'NETEASE_LOGIN_FAILED', result.message || '登录失败，请检查验证码')
      const identity = await options.provider.userAccount(result.cookie)
      if (!isAuthenticatedNeteaseAccount(identity.account)) return fail(reply, request, 401, 'NETEASE_ANONYMOUS_ACCOUNT', '未能确认网易云音乐账号，请重试')
      await saveNeteaseCookie(actorFrom(request), result.cookie)
      return ok(request, { authenticated: true, profile: { nickname: identity.profile?.nickname ?? null } })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease phone login failed')
      return fail(reply, request, 502, 'NETEASE_LOGIN_UNAVAILABLE', '暂时无法登录，请稍后重试', true)
    }
  })

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
        const identity = await options.provider.userAccount(result.cookie)
        if (!isAuthenticatedNeteaseAccount(identity.account)) {
          return fail(reply, request, 401, 'NETEASE_ANONYMOUS_ACCOUNT', '扫码凭据未关联网易云账号，请在网易云音乐 App 中确认登录后重试')
        }
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
      let account = status.data?.account ?? status.account ?? null
      let profile = status.data?.profile ?? status.profile ?? null
      if (!profile?.userId) {
        const userAccount = await options.provider.userAccount(cookie).catch(() => null)
        account = userAccount?.account ?? account
        profile = userAccount?.profile ?? profile
      }
      if (!isAuthenticatedNeteaseAccount(account)) return ok(request, { authenticated: false, account: null, profile: null, credentialStored: true, needsReconnect: true })
      const detail = await options.provider.getUserDetail(Number(account.id), cookie).catch(() => null)
      const verifiedProfile = detail?.profile?.userId ? detail.profile : profile
      const safeProfile = Number(verifiedProfile?.userId) === Number(account.id) ? { ...profile, ...detail?.profile } : null
      return ok(request, {
        authenticated: true, account,
        profile: safeProfile,
        level: detail?.level ?? null,
        listenSongs: detail?.listenSongs ?? null,
        createDays: detail?.createDays ?? null,
        credentialStored: await hasNeteaseCredential(userId),
      })
    } catch {
      return fail(reply, request, 502, 'NETEASE_STATUS_FAILED', '无法读取网易云登录状态', true)
    }
  })

  app.get('/me/overview', async (request, reply) => {
    const cookie = await getNeteaseCookie(actorFrom(request))
    if (!cookie) return fail(reply, request, 401, 'NETEASE_LOGIN_REQUIRED', '请先连接网易云音乐账号')
    try {
      const status = await options.provider.loginStatus(cookie)
      let account = status.data?.account ?? status.account
      if (!account?.id) account = (await options.provider.userAccount(cookie).catch(() => null))?.account
      if (!isAuthenticatedNeteaseAccount(account)) return fail(reply, request, 401, 'NETEASE_LOGIN_EXPIRED', '网易云登录已失效，请重新扫码连接')
      return ok(request, await options.provider.getAccountOverview(Number(account.id), cookie))
    } catch (error) {
      request.log.warn({ err: error }, 'Netease account overview unavailable')
      return fail(reply, request, 502, 'NETEASE_OVERVIEW_UNAVAILABLE', '暂时无法读取个人音乐数据', true)
    }
  })

  app.get('/me/recent-tracks', async (request, reply) => {
    const parsed = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(50).default(30) }).safeParse(request.query)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '分页参数不合法')
    const cookie = await getNeteaseCookie(actorFrom(request))
    if (!cookie) return fail(reply, request, 401, 'NETEASE_LOGIN_REQUIRED', '请先连接网易云音乐账号')
    try {
      const { items, total } = await options.provider.getRecentTracks(cookie, parsed.data.offset, parsed.data.limit)
      const nextOffset = parsed.data.offset + items.length
      return ok(request, { items, total, hasMore: nextOffset < total, nextOffset: nextOffset < total ? nextOffset : null })
    } catch (error) {
      request.log.warn({ err: error }, 'Netease recent tracks unavailable')
      return fail(reply, request, 502, 'NETEASE_RECENT_UNAVAILABLE', '暂时无法读取最近听过的歌曲', true)
    }
  })

  app.delete('/auth/netease/session', {
    onRequest: async (request) => {
      const headers = request.raw.headers
      if (headers['content-type']?.startsWith('application/json') &&
          (headers['content-length'] === undefined || headers['content-length'] === '0') &&
          headers['transfer-encoding'] === undefined) {
        delete headers['content-type']
      }
    },
  }, async (request) => {
    const userId = actorFrom(request)
    const cookie = await getNeteaseCookie(userId)
    await removeNeteaseCookie(userId)
    if (cookie) await options.provider.logout(cookie).catch(() => undefined)
    return ok(request, { authenticated: false })
  })
}
