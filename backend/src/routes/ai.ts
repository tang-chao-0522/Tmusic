import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AgentFailure, type AgentService } from '../agent/agentService'
import { env } from '../config/env'
import { isMongoReady } from '../infra/mongo'
import { fail, ok } from '../lib/http'
import { aiSessionFrom } from '../security/aiSession'
import { credentialMatchesAccount } from '../services/credentialService'
import { userModelInputSchema } from '../agent/customModel'

const id = z.string().min(1).max(100)
const messageSchema = z.object({ clientMessageId: id, content: z.array(z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(4000) })).min(1).max(1) }).strict()
const editSchema = z.object({ name: z.string().trim().min(1).max(40), sourceIds: z.array(z.string().regex(/^\d+$/)).max(100), expectedVersion: z.number().int().positive() }).strict()

function sameOrigin(request: FastifyRequest) { return !request.headers.origin || request.headers.origin === env.WEB_ORIGIN }

export const aiRoutes: FastifyPluginAsync<{ agent: AgentService | null; startupError?: AgentFailure | null }> = async (app, { agent, startupError }) => {
  app.addHook('preHandler', async (request, reply) => {
    if (!agent) return startupError
      ? fail(reply, request, startupError.status, startupError.code, startupError.message)
      : fail(reply, request, 503, 'AI_UNAVAILABLE', 'AI 服务初始化失败，请查看后端启动日志', true)
    if (!isMongoReady()) return fail(reply, request, 503, 'AI_STORAGE_UNAVAILABLE', 'MongoDB 未连接，AI 会话暂不可用', true)
    if (!sameOrigin(request) && !['GET', 'HEAD'].includes(request.method)) return fail(reply, request, 403, 'ORIGIN_FORBIDDEN', '请求来源不合法')
    const session = aiSessionFrom(request)
    if (!session || !(await credentialMatchesAccount(session.credentialOwnerId, session.accountId))) return fail(reply, request, 401, 'AI_LOGIN_REQUIRED', '请先重新登录网易云账号')
  })

  const identity = (request: FastifyRequest) => aiSessionFrom(request)!
  const param = (request: FastifyRequest, name: string) => (request.params as Record<string, string>)[name]!

  app.get('/ai/model-config', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return ok(request, await agent!.getUserModelConfig(identity(request).accountId))
  })
  app.put('/ai/model-config', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const parsed = userModelInputSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '模型配置格式不合法')
    return ok(request, await agent!.saveUserModelConfig(identity(request).accountId, parsed.data))
  })
  app.delete('/ai/model-config', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return ok(request, await agent!.deleteUserModelConfig(identity(request).accountId))
  })

  app.get('/ai/conversations', async (request) => ok(request, await agent!.listConversations(identity(request).accountId)))
  app.post('/ai/conversations', async (request, reply) => reply.status(201).send(ok(request, await agent!.createConversation(identity(request)))))
  app.get('/ai/conversations/:conversationId', async (request) => ok(request, await agent!.getConversation(param(request, 'conversationId'), identity(request).accountId)))
  app.patch('/ai/conversations/:conversationId', async (request, reply) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(60).optional(), archived: z.boolean().optional() }).strict().safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '会话更新内容不合法')
    return ok(request, await agent!.updateConversation(param(request, 'conversationId'), identity(request).accountId, parsed.data.title, parsed.data.archived))
  })
  app.delete('/ai/conversations/:conversationId', async (request) => ok(request, await agent!.updateConversation(param(request, 'conversationId'), identity(request).accountId, undefined, true)))

  app.post('/ai/conversations/:conversationId/messages', async (request, reply) => {
    const parsed = messageSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '消息内容不合法')
    const run = await agent!.sendMessage(param(request, 'conversationId'), identity(request), parsed.data.clientMessageId, parsed.data.content[0]!.text)
    return reply.status(202).send(ok(request, { messageId: run.messageId, runId: run.id, status: run.status, eventsUrl: `/api/v1/ai/runs/${run.id}/events` }))
  })
  app.post('/ai/messages/:messageId/regenerate', async (request, reply) => reply.status(202).send(ok(request, await agent!.regenerate(param(request, 'messageId'), identity(request)))))
  app.get('/ai/runs/:runId', async (request) => ok(request, await agent!.getRun(param(request, 'runId'), identity(request).accountId)))
  app.get('/ai/runs/:runId/plan', async (request) => {
    const run = await agent!.getRun(param(request, 'runId'), identity(request).accountId)
    return ok(request, { plan: run.plan, steps: run.steps })
  })
  app.post('/ai/runs/:runId/cancel', async (request) => ok(request, await agent!.cancelRun(param(request, 'runId'), identity(request).accountId)))
  app.get('/ai/runs/:runId/events', async (request, reply) => {
    const runId = param(request, 'runId')
    const accountId = identity(request).accountId
    await agent!.getRun(runId, accountId)
    const header = request.headers['last-event-id']
    const cursor = Number(Array.isArray(header) ? header[0] : header ?? (request.query as { after?: string }).after ?? 0)
    if (!Number.isSafeInteger(cursor) || cursor < 0) return fail(reply, request, 422, 'VALIDATION_ERROR', '事件游标不合法')
    reply.hijack()
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    let closed = false
    request.raw.on('close', () => { closed = true })
    let after = cursor
    while (!closed) {
      const batch = await agent!.events(runId, accountId, after).catch(() => null)
      if (!batch) break
      if (batch.gap) {
        reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(batch.snapshot)}\n\n`)
        after = batch.latestSequence
      }
      for (const event of batch.events) {
        if (event.sequence <= after) continue
        reply.raw.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
        after = event.sequence
      }
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(batch.status) && after >= batch.latestSequence) break
      reply.raw.write(': keepalive\n\n')
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    reply.raw.end()
  })

  app.get('/ai/playlist-drafts/:draftId', async (request) => ok(request, await agent!.getDraft(param(request, 'draftId'), identity(request).accountId)))
  app.patch('/ai/playlist-drafts/:draftId', async (request, reply) => {
    const parsed = editSchema.safeParse(request.body)
    if (!parsed.success) return fail(reply, request, 422, 'VALIDATION_ERROR', '草稿内容不合法')
    return ok(request, await agent!.updateDraft(param(request, 'draftId'), identity(request).accountId, parsed.data.expectedVersion, parsed.data.name, parsed.data.sourceIds))
  })
  app.post('/ai/playlist-drafts/:draftId/publish', async (request, reply) => {
    const parsed = z.object({ expectedVersion: z.number().int().positive() }).safeParse(request.body)
    const key = request.headers['idempotency-key']
    if (!parsed.success || typeof key !== 'string' || !id.safeParse(key).success) return fail(reply, request, 422, 'VALIDATION_ERROR', '发布请求不合法')
    return ok(request, await agent!.publishDraft(param(request, 'draftId'), identity(request), parsed.data.expectedVersion, key))
  })
  app.delete('/ai/playlist-drafts/:draftId', async (request, reply) => {
    const draft = await agent!.getDraft(param(request, 'draftId'), identity(request).accountId)
    if (draft.status !== 'DRAFT') return fail(reply, request, 409, 'AI_DRAFT_NOT_EDITABLE', '草稿不能丢弃')
    await agent!.deleteDraft(draft.id, identity(request).accountId)
    return ok(request, { deleted: true })
  })
}
