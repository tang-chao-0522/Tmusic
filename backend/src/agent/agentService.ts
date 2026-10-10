import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { Context } from '@earendil-works/chord'
import { Type } from '@earendil-works/pi-ai'
import { createModels, createProvider } from '@earendil-works/pi-ai/models'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { createRegistry, defineExtension, defineTool, Harness, section, watchEvents, type AgentEvent, type ConversationId, type SubmissionId, type ToolExecutionApi } from '@earendil-works/pi-durable'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { nanoid } from 'nanoid'
import type { TrackRef } from '@tmusic/contracts'
import { trackRefSchema } from '@tmusic/contracts'
import { env } from '../config/env'
import { loadAgentModelConfig, type AgentModelConfig } from '../config/agentModel'
import { AiConversationModel, type AiConversationRecord } from '../models/AiConversation'
import { AiRunModel, type AiRunRecord } from '../models/AiRun'
import { PlaylistDraftModel } from '../models/PlaylistDraft'
import { UserModelConfigModel, type UserModelConfigRecord } from '../models/UserModelConfig'
import type { NeteaseProvider } from '../providers/neteaseProvider'
import { getNeteaseCookie } from '../services/credentialService'
import { PlanDoc, publicPlan } from './sop'
import { requestIntent } from './requestIntent'
import { assertPublicBaseUrl, maskApiKey, type userModelInputSchema } from './customModel'
import { decryptCredential, encryptCredential } from '../security/credentialCipher'
import type { z } from 'zod'

const context = BACKGROUND_CONTEXT
type Identity = { accountId: string; credentialOwnerId: string }
const errorKind = (error: unknown) => error instanceof Error ? error.name : 'unknown'

export class AgentFailure extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export class AgentService {
  private harness!: Awaited<ReturnType<typeof Harness.open>>
  private config!: AgentModelConfig
  private models!: ReturnType<typeof createModels>
  private attached = new Set<string>()

  private constructor(private readonly provider: NeteaseProvider) {}

  static async open(provider: NeteaseProvider) {
    const service = new AgentService(provider)
    service.config = await loadAgentModelConfig()
    if (env.NODE_ENV === 'production' && !env.AI_SESSION_SECRET) throw new AgentFailure('AI_SESSION_SECRET_MISSING', '请配置 AI_SESSION_SECRET 并重启 API', 503)
    const models = createModels()
    service.models = models
    models.setProvider(service.config.provider === 'openai' ? openaiProvider() : anthropicProvider())
    for (const custom of await UserModelConfigModel.find().lean()) service.registerUserProvider(custom)
    const registry = createRegistry()
    registry.install(service.musicExtension())
    const backendDir = existsSync(path.join(process.cwd(), 'backend', 'package.json')) ? path.join(process.cwd(), 'backend') : process.cwd()
    const file = env.AI_DATA_PATH || path.join(backendDir, '.local', 'agent.sqlite')
    await mkdir(path.dirname(file), { recursive: true })
    service.harness = await Harness.open(await openNodeSqliteStorage(file), {
      models, registry,
      settings: { stream: { timeoutMs: service.config.requestTimeoutMs }, toolExecution: 'sequential' },
      onReport: (error) => console.error('Pi Durable extension failure', errorKind(error)),
    }, context)
    service.harness.resume()
    for (const run of await AiRunModel.find({ status: { $in: ['QUEUED', 'RUNNING'] } }).lean()) {
      void service.resumeRun(run.publicId).catch((error) => console.error('AI run recovery failed', run.publicId, errorKind(error)))
    }
    return service
  }

  async close() { await this.harness.close(context) }

  private userProviderId(accountId: string) { return `tmusic-user-${createHash('sha256').update(accountId).digest('hex').slice(0, 24)}` }

  private registerUserProvider(config: UserModelConfigRecord) {
    const providerId = this.userProviderId(config.accountId)
    const common = {
      id: providerId,
      name: '用户自定义模型接口',
      baseUrl: config.baseUrl,
      auth: { apiKey: { name: '用户自定义模型 Key', resolve: async () => {
        const current = await UserModelConfigModel.findOne({ accountId: config.accountId }).select('+apiKeyCiphertext +apiKeyIv +apiKeyAuthTag').lean()
        if (!current) return undefined
        if (current.baseUrl !== config.baseUrl || current.model !== config.model || current.provider !== config.provider) throw new Error('自定义模型配置已更新，请重新提交请求')
        await assertPublicBaseUrl(current.baseUrl)
        return { auth: { apiKey: decryptCredential({ ciphertext: current.apiKeyCiphertext, iv: current.apiKeyIv, authTag: current.apiKeyAuthTag }) } }
      } } },
      model: { id: config.model, name: config.model, provider: providerId, baseUrl: config.baseUrl, reasoning: false, input: ['text'] as ('text' | 'image')[], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: this.config.customModelContextWindow, maxTokens: this.config.customModelMaxTokens },
    }
    this.models.setProvider(config.provider === 'anthropic-compatible'
      ? createProvider({ id: common.id, name: common.name, baseUrl: common.baseUrl, auth: common.auth, models: [{ ...common.model, api: 'anthropic-messages' as const }], api: anthropicMessagesApi() })
      : createProvider({ id: common.id, name: common.name, baseUrl: common.baseUrl, auth: common.auth, models: [{ ...common.model, api: 'openai-completions' as const }], api: openAICompletionsApi() }))
  }

  private async modelFor(accountId: string) {
    const custom = await UserModelConfigModel.findOne({ accountId }).lean()
    if (custom) {
      this.registerUserProvider(custom)
      return { provider: this.userProviderId(accountId), modelId: custom.model }
    }
    const credentialVariable = this.config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    if (!process.env[credentialVariable]) throw new AgentFailure('AI_MODEL_KEY_MISSING', `请先添加自定义模型，或由管理员配置 ${credentialVariable}`, 503)
    if (!this.models.getModel(this.config.provider, this.config.modelId)) throw new AgentFailure('AI_MODEL_UNAVAILABLE', `模型 ${this.config.provider}/${this.config.modelId} 不可用`, 503)
    return { provider: this.config.provider, modelId: this.config.modelId }
  }

  async getUserModelConfig(accountId: string) {
    const config = await UserModelConfigModel.findOne({ accountId }).lean()
    return config ? { provider: config.provider, baseUrl: config.baseUrl, model: config.model, apiKeyMasked: maskApiKey(config.apiKeyLast4), source: 'custom' as const } : { source: 'default' as const, provider: this.config.provider, model: this.config.modelId, configured: Boolean(process.env[this.config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY']) }
  }

  async saveUserModelConfig(accountId: string, input: z.infer<typeof userModelInputSchema>) {
    const active = await AiRunModel.exists({ accountId, status: { $in: ['QUEUED', 'RUNNING'] } })
    if (active) throw new AgentFailure('AI_MODEL_CONFIG_BUSY', '有任务正在运行，请完成后再修改模型配置', 409)
    let baseUrl: string
    try { baseUrl = await assertPublicBaseUrl(input.baseUrl) }
    catch { throw new AgentFailure('AI_BASE_URL_INVALID', 'Base URL 必须是可解析的公开 HTTPS 地址', 422) }
    const previous = await UserModelConfigModel.findOne({ accountId }).lean()
    if (!previous && !input.apiKey) throw new AgentFailure('AI_MODEL_KEY_REQUIRED', '首次保存时必须填写 API Key', 422)
    const encrypted = input.apiKey ? encryptCredential(input.apiKey) : null
    const update = { provider: input.provider, baseUrl, model: input.model, ...(encrypted ? { apiKeyCiphertext: encrypted.ciphertext, apiKeyIv: encrypted.iv, apiKeyAuthTag: encrypted.authTag, apiKeyLast4: input.apiKey!.slice(-4) } : {}) }
    await UserModelConfigModel.updateOne({ accountId }, { $set: update }, { upsert: true })
    this.registerUserProvider((await UserModelConfigModel.findOne({ accountId }).lean())!)
    return this.getUserModelConfig(accountId)
  }

  async deleteUserModelConfig(accountId: string) {
    if (await AiRunModel.exists({ accountId, status: { $in: ['QUEUED', 'RUNNING'] } })) throw new AgentFailure('AI_MODEL_CONFIG_BUSY', '有任务正在运行，请完成后再删除模型配置', 409)
    await UserModelConfigModel.deleteOne({ accountId })
    this.models.deleteProvider(this.userProviderId(accountId))
    return this.getUserModelConfig(accountId)
  }

  private async conversationFor(id: string, accountId: string) {
    const item = await AiConversationModel.findOne({ publicId: id, accountId, archived: false }).lean()
    if (!item) throw new AgentFailure('AI_CONVERSATION_NOT_FOUND', '会话不存在', 404)
    return item
  }

  async listConversations(accountId: string) {
    return (await AiConversationModel.find({ accountId, archived: false }).sort({ updatedAt: -1 }).limit(50).lean())
      .map((item) => ({ id: item.publicId, title: item.title, updatedAt: item.updatedAt }))
  }

  async createConversation(identity: Identity) {
    const model = await this.modelFor(identity.accountId)
    const pi = await this.harness.createConversation({
      ownership: { kind: 'ownerless' },
      agent: { model, thinkingLevel: this.config.thinkingLevel },
    }, context)
    const id = `aic_${nanoid(16)}`
    try {
      await AiConversationModel.create({ publicId: id, accountId: identity.accountId, credentialOwnerId: identity.credentialOwnerId, piConversationId: pi.id, title: '新对话', archived: false })
    } catch (error) {
      await pi.abort(context).catch(() => undefined)
      throw error
    }
    return { id, title: '新对话' }
  }

  async getConversation(id: string, accountId: string) {
    const item = await this.conversationFor(id, accountId)
    const runs = await AiRunModel.find({ conversationId: id, accountId }).sort({ createdAt: 1 }).limit(100).lean()
    return { id, title: item.title, runs: runs.map((run) => this.runView(run)) }
  }

  async updateConversation(id: string, accountId: string, title?: string, archived?: boolean) {
    const item = await this.conversationFor(id, accountId)
    if (archived) {
      const active = await AiRunModel.findOne({ conversationId: id, status: { $in: ['QUEUED', 'RUNNING'] } }).lean()
      if (active) await this.cancelRun(active.publicId, accountId)
    }
    await AiConversationModel.updateOne({ publicId: item.publicId }, { $set: { ...(title === undefined ? {} : { title }), ...(archived === undefined ? {} : { archived }) } })
    return { id, title: title ?? item.title, archived: archived ?? item.archived }
  }

  async sendMessage(id: string, identity: Identity, clientMessageId: string, text: string) {
    const item = await this.conversationFor(id, identity.accountId)
    const existing = await AiRunModel.findOne({ conversationId: id, clientMessageId }).lean()
    if (existing) return this.runView(existing)
    if (await AiRunModel.exists({ conversationId: id, status: { $in: ['QUEUED', 'RUNNING'] } })) throw new AgentFailure('AI_CONVERSATION_BUSY', '上一条消息仍在生成，请稍后发送', 409)
    const model = await this.modelFor(identity.accountId)
    const conversation = await this.harness.conversation(item.piConversationId as ConversationId, context)
    if (!conversation) throw new AgentFailure('AI_CONVERSATION_NOT_FOUND', '会话不存在', 404)
    await conversation.configure({ model }, context)
    const runId = `airun_${nanoid(16)}`
    const intent = requestIntent(text)
    try {
      await AiRunModel.create({ publicId: runId, messageId: `aimsg_${nanoid(16)}`, conversationId: id, accountId: identity.accountId, clientMessageId, userText: text, ...intent, status: 'QUEUED' })
    } catch (error) {
      const duplicate = await AiRunModel.findOne({ conversationId: id, clientMessageId }).lean()
      if (duplicate) return this.runView(duplicate)
      if (await AiRunModel.exists({ conversationId: id, status: { $in: ['QUEUED', 'RUNNING'] } })) throw new AgentFailure('AI_CONVERSATION_BUSY', '上一条消息仍在生成，请稍后发送', 409)
      throw error
    }
    await AiConversationModel.updateOne({ publicId: id, title: '新对话' }, { $set: { title: text.slice(0, 30) } })
    void this.resumeRun(runId).catch((error) => console.error('AI run start failed', runId, errorKind(error)))
    return this.runView((await AiRunModel.findOne({ publicId: runId }).lean())!)
  }

  async getRun(runId: string, accountId: string) {
    const run = await AiRunModel.findOne({ publicId: runId, accountId }).lean()
    if (!run) throw new AgentFailure('AI_RUN_NOT_FOUND', '任务不存在', 404)
    return this.runView(run)
  }

  async regenerate(messageId: string, identity: Identity) {
    const original = await AiRunModel.findOne({ messageId, accountId: identity.accountId }).lean()
    if (!original || original.status !== 'COMPLETED' || !original.submissionId) throw new AgentFailure('AI_MESSAGE_NOT_FOUND', '消息不存在或尚未完成', 404)
    const oldMapping = await this.conversationFor(original.conversationId, identity.accountId)
    const oldPi = await this.harness.conversation(oldMapping.piConversationId as ConversationId, context)
    if (!oldPi) throw new AgentFailure('AI_CONVERSATION_NOT_FOUND', '会话不存在', 404)
    const submission = await this.harness.submission(Number(original.submissionId) as SubmissionId, context)
    const status = await submission?.status(context)
    if (!status || status.type !== 'input' || status.status !== 'done') throw new AgentFailure('AI_MESSAGE_NOT_FOUND', '无法取得原消息上下文', 404)
    const history = await oldPi.entries({ order: 'descending', maxEntryId: status.entry }, 2, undefined, context)
    if (history.items[0]?.id !== status.entry) throw new AgentFailure('AI_MESSAGE_NOT_FOUND', '无法取得原消息上下文', 404)
    const pi = history.items[1]
      ? await oldPi.fork(history.items[1].id, { ownership: { kind: 'ownerless' } }, context)
      : await this.harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model: await this.modelFor(identity.accountId), thinkingLevel: this.config.thinkingLevel } }, context)
    const id = `aic_${nanoid(16)}`
    await AiConversationModel.create({ publicId: id, accountId: identity.accountId, credentialOwnerId: identity.credentialOwnerId, piConversationId: pi.id, title: `${oldMapping.title} · 重新生成`.slice(0, 60), archived: false })
    const run = await this.sendMessage(id, identity, nanoid(16), original.userText)
    return { conversationId: id, runId: run.id, messageId: run.messageId, eventsUrl: `/api/v1/ai/runs/${run.id}/events` }
  }

  async events(runId: string, accountId: string, after: number) {
    const run = await AiRunModel.findOne({ publicId: runId, accountId }).lean()
    if (!run) throw new AgentFailure('AI_RUN_NOT_FOUND', '任务不存在', 404)
    return { status: run.status, events: run.events.filter((event) => event.sequence > after), latestSequence: run.eventSequence, gap: Boolean(run.events.length && after < run.events[0]!.sequence - 1), snapshot: this.runView(run) }
  }

  async cancelRun(runId: string, accountId: string) {
    const run = await AiRunModel.findOne({ publicId: runId, accountId }).lean()
    if (!run) throw new AgentFailure('AI_RUN_NOT_FOUND', '任务不存在', 404)
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return this.runView(run)
    const item = await this.conversationFor(run.conversationId, accountId)
    const conversation = await this.harness.conversation(item.piConversationId as ConversationId, context)
    if (conversation) await conversation.abort(context)
    await AiRunModel.updateOne({ publicId: runId, status: { $in: ['QUEUED', 'RUNNING'] } }, { $set: { status: 'CANCELLED' } })
    await this.appendEvent(runId, 'run.cancelled', {})
    return this.getRun(runId, accountId)
  }

  private runView(run: AiRunRecord) {
    return { id: run.publicId, messageId: run.messageId, conversationId: run.conversationId, status: run.status, userText: run.userText, requestedTrackCount: run.requestedTrackCount ?? 0, wantsPlaylist: run.wantsPlaylist ?? false, answerText: run.answerText, cards: run.cards, plan: run.plan, steps: run.steps, errorCode: run.errorCode, latestSequence: run.eventSequence, createdAt: run.createdAt }
  }

  private async appendEvent(runId: string, type: string, data: Record<string, unknown>) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const run = await AiRunModel.findOne({ publicId: runId }).select('eventSequence').lean()
      if (!run) return
      const sequence = run.eventSequence + 1
      const result = await AiRunModel.updateOne({ publicId: runId, eventSequence: run.eventSequence }, {
        $inc: { eventSequence: 1 },
        $push: { events: { $each: [{ sequence, type, data, createdAt: new Date().toISOString() }], $slice: -500 } },
      })
      if (result.modifiedCount) return
    }
    throw new Error('AI event sequence conflict')
  }

  private async currentRun(piConversationId: ConversationId) {
    const item = await AiConversationModel.findOne({ piConversationId }).lean()
    if (!item) throw new Error('AI conversation mapping missing')
    const run = await AiRunModel.findOne({ conversationId: item.publicId, status: { $in: ['QUEUED', 'RUNNING'] } }).sort({ createdAt: -1 }).lean()
    if (!run) throw new Error('AI active run missing')
    return { item, run }
  }

  private async resumeRun(runId: string) {
    if (this.attached.has(runId)) return
    this.attached.add(runId)
    let stream: Awaited<ReturnType<typeof watchEvents>> | undefined
    try {
      const run = await AiRunModel.findOne({ publicId: runId }).lean()
      if (!run || !['QUEUED', 'RUNNING'].includes(run.status)) return
      const item = await AiConversationModel.findOne({ publicId: run.conversationId }).lean()
      if (!item) throw new Error('AI conversation mapping missing')
      const conversation = await this.harness.conversation(item.piConversationId as ConversationId, context)
      if (!conversation) throw new Error('Pi conversation missing')
      stream = await watchEvents(this.harness, conversation.id, context)
      stream.start(async (events) => {
        for (const event of events) await this.projectEvent(runId, event)
      })
      const submission = await conversation.submit({ type: 'input', content: run.userText, requestId: `${run.accountId}:${run.conversationId}:${run.clientMessageId}` }, context)
      await AiRunModel.updateOne({ publicId: runId, status: { $in: ['QUEUED', 'RUNNING'] } }, { $set: { submissionId: submission.id, status: 'RUNNING' } })
      await this.appendEvent(runId, 'run.started', { runId })
      const settled = await submission.wait(context)
      const latest = await AiRunModel.findOne({ publicId: runId }).lean()
      if (latest?.status === 'CANCELLED') return
      if (settled.status === 'done' && settled.type === 'input') {
        const verifiedCount = this.verifiedTrackIds(latest?.cards ?? []).size
        const target = latest?.requestedTrackCount ?? 0
        if (target > 0 && verifiedCount < target) {
          await this.failIncompleteRun(conversation, runId, 'AI_RECOMMENDATION_INCOMPLETE', `只核验了 ${verifiedCount}/${target} 首歌曲，请调整条件后重试。`)
          return
        }
        if (latest?.wantsPlaylist && !latest.cards.some((card) => card.type === 'draft')) {
          await this.failIncompleteRun(conversation, runId, 'AI_PLAYLIST_DRAFT_INCOMPLETE', '歌曲已核验，但歌单草稿尚未创建，请重试。')
          return
        }
        const transcript = await conversation.context(context)
        const entry = transcript.entries.find((candidate) => candidate.id === settled.answer)
        const answer = entry?.model?.filter((message) => message.role === 'assistant').flatMap((message) => message.content.filter((block) => block.type === 'text').map((block) => block.text)).join('') ?? ''
        await AiRunModel.updateOne({ publicId: runId }, { $set: { status: 'COMPLETED', answerText: answer } })
        await this.appendEvent(runId, 'message.completed', { text: answer })
      } else {
        const count = this.verifiedTrackIds(latest?.cards ?? []).size
        const target = latest?.requestedTrackCount ?? 0
        await this.failIncompleteRun(conversation, runId, 'AI_RUN_UNANSWERED', target > 0 ? `任务中断，已核验 ${count}/${target} 首歌曲，请重试。` : '任务中断，请重试。')
      }
    } catch (error) {
      await AiRunModel.updateOne({ publicId: runId, status: { $ne: 'CANCELLED' } }, { $set: { status: 'FAILED', errorCode: 'AI_RUN_FAILED', answerText: 'AI 服务暂时不可用，请重试。' } })
      await this.appendEvent(runId, 'run.failed', { code: 'AI_RUN_FAILED', message: 'AI 服务暂时不可用' }).catch(() => undefined)
      throw error
    } finally {
      await stream?.stop().catch(() => undefined)
      this.attached.delete(runId)
    }
  }

  private verifiedTrackIds(cards: AiRunRecord['cards']) {
    return new Set(cards.flatMap((card) => {
      const parsed = card.type === 'track' ? trackRefSchema.safeParse(card.track) : null
      return parsed?.success ? [parsed.data.sourceId] : []
    }))
  }

  private async recordTrackCard(runId: string, track: TrackRef) {
    const result = await AiRunModel.updateOne({ publicId: runId, 'cards.track.sourceId': { $ne: track.sourceId } }, { $push: { cards: { type: 'track', track } } })
    if (result.modifiedCount) await this.appendEvent(runId, 'content.card', { type: 'track', track })
  }

  private async finishTrackTodoWhenReady(api: ToolExecutionApi, todoId: string, ctx: Context) {
    const { run } = await this.currentRun(api.conversationId)
    const count = this.verifiedTrackIds(run.cards).size
    if (count >= (run.requestedTrackCount || 1)) await this.finishTodo(api, todoId, `已核验 ${count} 首真实曲目`, ctx)
  }

  private async failIncompleteRun(conversation: Awaited<ReturnType<typeof this.harness.conversation>> & {}, runId: string, code: string, message: string) {
    await conversation.commit(async (tx) => {
      const plan = await tx.doc(PlanDoc, conversation.id)
      if (plan.runId === runId) {
        plan.status = 'BLOCKED'
        for (const todo of plan.todos) if (todo.status !== 'DONE') todo.status = 'BLOCKED'
      }
    }, context)
    const plan = await this.harness.snapshot(PlanDoc, conversation.id, context)
    await AiRunModel.updateOne({ publicId: runId }, { $set: { status: 'FAILED', errorCode: code, answerText: message, ...(plan ? { plan: publicPlan(plan) } : {}) } })
    await this.appendEvent(runId, 'run.failed', { code, message })
  }

  private async projectEvent(runId: string, event: AgentEvent) {
    const run = await AiRunModel.findOne({ publicId: runId }).select('status').lean()
    if (!run || run.status !== 'RUNNING') return
    if (event.type === 'message_update') {
      const delta = event.changes.flatMap((change) => change.type === 'text_delta' ? [change.delta] : []).join('')
      if (delta) {
        await AiRunModel.updateOne({ publicId: runId }, [{ $set: { answerText: { $concat: [{ $ifNull: ['$answerText', ''] }, delta] } } }])
        await this.appendEvent(runId, 'message.delta', { delta })
      }
    } else if (event.type === 'tool_execution_start') {
      await this.appendEvent(runId, 'tool.started', { toolCallId: event.toolCallId, name: event.toolName })
    }
  }

  private async withTool<T>(api: ToolExecutionApi, ctx: Context, todoId: string, name: string, work: (item: AiConversationRecord, run: AiRunRecord) => Promise<T>): Promise<T> {
    const { item, run } = await this.currentRun(api.conversationId)
    if (run.steps.length >= this.config.maxToolCallsPerRun) throw new Error('本次任务的工具调用次数已达上限')
    const plan = await api.snapshot(PlanDoc, api.conversationId, ctx)
    const selectedTodo = plan?.todos.find((todo) => todo.id === todoId)
    if (plan?.runId !== run.publicId || !selectedTodo || !['PENDING', 'IN_PROGRESS'].includes(selectedTodo.status)) throw new Error('Todo 不存在或已结束，请先制定计划')
    if (!selectedTodo.dependsOn.every((id) => plan.todos.some((todo) => todo.id === id && todo.status === 'DONE'))) throw new Error('Todo 的前置任务尚未完成')
    await api.commit(async (tx) => {
      const active = await tx.doc(PlanDoc, api.conversationId)
      const todo = active.todos.find((entry) => entry.id === todoId)
      if (todo?.status === 'PENDING') todo.status = 'IN_PROGRESS'
    }, ctx)
    const inProgress = await api.snapshot(PlanDoc, api.conversationId, ctx)
    if (inProgress) await AiRunModel.updateOne({ publicId: run.publicId }, { $set: { plan: publicPlan(inProgress) } })
    await this.appendEvent(run.publicId, 'todo.updated', { todoId, status: 'IN_PROGRESS' })
    const step = { id: `step_${nanoid(10)}`, todoId, name, taskId: String(api.taskId), status: 'RUNNING', startedAt: new Date().toISOString() }
    await AiRunModel.updateOne({ publicId: run.publicId }, { $push: { steps: step } })
    await this.appendEvent(run.publicId, 'step.started', { step })
    try {
      const result = await work(item, run)
      await AiRunModel.updateOne({ publicId: run.publicId, 'steps.id': step.id }, { $set: { 'steps.$.status': 'SUCCEEDED' } })
      await this.appendEvent(run.publicId, 'step.completed', { stepId: step.id, todoId })
      return result
    } catch (error) {
      await AiRunModel.updateOne({ publicId: run.publicId, 'steps.id': step.id }, { $set: { 'steps.$.status': 'FAILED' } })
      await this.appendEvent(run.publicId, 'step.failed', { stepId: step.id, todoId, message: error instanceof Error ? error.message : '执行失败' })
      throw error
    }
  }

  private musicExtension() {
    const service = this
    const submitPlan = defineTool({
      name: 'submit_plan', description: '在执行音乐检索前，提交本次请求的简短目标与待办计划。',
      parameters: Type.Object({
        goal: Type.String({ minLength: 1, maxLength: 200 }),
        constraints: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 5 }),
        assumptions: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 5 }),
        missingInformation: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 5 }),
        proposedApproach: Type.String({ minLength: 1, maxLength: 300 }),
        todos: Type.Array(Type.Object({ title: Type.String({ minLength: 1, maxLength: 100 }), acceptance: Type.String({ minLength: 1, maxLength: 200 }), dependsOn: Type.Array(Type.Integer({ minimum: 1, maximum: service.config.maxPlanTodos }), { maxItems: service.config.maxPlanTodos }) }), { minItems: 1, maxItems: service.config.maxPlanTodos }),
      }),
      replay: 'safe',
      execute: async (args, api, ctx) => {
        const { run } = await service.currentRun(api.conversationId)
        const previous = await api.snapshot(PlanDoc, api.conversationId, ctx)
        if (previous?.runId === run.publicId) {
          await AiRunModel.updateOne({ publicId: run.publicId }, { $set: { plan: publicPlan(previous) } })
          return { content: [{ type: 'text' as const, text: JSON.stringify(publicPlan(previous)) }] }
        }
        if (args.todos.some((todo, index) => todo.dependsOn.some((dependency) => dependency > index))) throw new Error('Todo 只能依赖列表中已出现的前置任务')
        if (!run.wantsPlaylist && args.todos.some((todo) => /歌单|草稿|播放列表/.test(todo.title))) throw new Error('用户只要歌曲列表，不要加入创建歌单的任务')
        const plan = { runId: run.publicId, version: 1, goal: args.goal, constraints: args.constraints, assumptions: args.assumptions, missingInformation: args.missingInformation, proposedApproach: args.proposedApproach, status: 'ACTIVE' as const, todos: args.todos.map((todo, index) => ({ id: `todo-${index + 1}`, title: todo.title, acceptance: todo.acceptance, dependsOn: todo.dependsOn.map((dependency) => `todo-${dependency}`), status: 'PENDING' as const, evidence: [] as string[] })) }
        await api.commit(async (tx) => { Object.assign(await tx.doc(PlanDoc, api.conversationId), plan) }, ctx)
        await AiRunModel.updateOne({ publicId: run.publicId }, { $set: { plan: publicPlan(plan) } })
        await service.appendEvent(run.publicId, 'analysis.summary', { goal: plan.goal, constraints: plan.constraints, assumptions: plan.assumptions, missingInformation: plan.missingInformation, proposedApproach: plan.proposedApproach })
        await service.appendEvent(run.publicId, 'plan.created', { plan: publicPlan(plan) })
        return { content: [{ type: 'text' as const, text: JSON.stringify(publicPlan(plan)) }] }
      },
    })
    const searchTracks = defineTool({
      name: 'search_tracks', description: '搜索真实网易云歌曲并返回候选 ID；结果只是候选。数量不够时换检索词继续搜索，随后用 verify_tracks 批量核验所选 ID。',
      parameters: Type.Object({ todoId: Type.String(), query: Type.String({ minLength: 1, maxLength: 100 }) }), replay: 'safe',
      execute: async (args, api, ctx) => {
        const tracks = await service.withTool(api, ctx, args.todoId, 'search_tracks', async (_item, run) => {
          const result = await service.provider.searchCatalog('song', args.query, service.config.maxSearchResults, 0)
          const candidates = (result.items as TrackRef[]).filter((track) => trackRefSchema.safeParse(track).success)
          if (candidates.length) await AiRunModel.updateOne({ publicId: run.publicId }, { $addToSet: { candidateSourceIds: { $each: candidates.map((track) => track.sourceId) } } })
          return candidates
        })
        const { run } = await service.currentRun(api.conversationId)
        if ((run.candidateSourceIds ?? []).length >= (run.requestedTrackCount || 1)) await service.finishTodo(api, args.todoId, `找到 ${run.candidateSourceIds.length} 首候选曲目`, ctx)
        return { content: [{ type: 'text' as const, text: JSON.stringify(tracks) }] }
      },
    })
    const getTrackDetail = defineTool({
      name: 'get_track_detail', description: '核对一首已搜索到的网易云歌曲；多首歌曲优先用 verify_tracks 一次核验。',
      parameters: Type.Object({ todoId: Type.String(), sourceId: Type.String({ pattern: '^\\d+$' }) }), replay: 'safe',
      execute: async (args, api, ctx) => {
        const track = await service.withTool(api, ctx, args.todoId, 'get_track_detail', async (_item, run) => {
          if (!(run.candidateSourceIds ?? []).includes(args.sourceId)) throw new Error('歌曲 ID 不在本次搜索结果中')
          const value = await service.provider.getTrackDetail(args.sourceId)
          if (value) await service.recordTrackCard(run.publicId, value)
          return value
        })
        if (!track) return { content: [{ type: 'text' as const, text: '歌曲不存在' }] }
        await service.finishTrackTodoWhenReady(api, args.todoId, ctx)
        return { content: [{ type: 'text' as const, text: JSON.stringify(track) }] }
      },
    })
    const verifyTracks = defineTool({
      name: 'verify_tracks', description: '批量核验已搜索到的歌曲 ID，并把真实曲目加入可播放的推荐列表。用户要 N 首时请一次选择 N 首不同的候选；不够时继续搜索后再核验。',
      parameters: Type.Object({ todoId: Type.String(), sourceIds: Type.Array(Type.String({ pattern: '^\\d+$' }), { minItems: 1, maxItems: 30 }) }), replay: 'safe',
      execute: async (args, api, ctx) => {
        const tracks = await service.withTool(api, ctx, args.todoId, 'verify_tracks', async (_item, run) => {
          const ids = [...new Set(args.sourceIds)]
          if (ids.some((id) => !(run.candidateSourceIds ?? []).includes(id))) throw new Error('歌曲 ID 必须来自本次搜索结果')
          const existing = service.verifiedTrackIds(run.cards)
          const needed = run.requestedTrackCount > 1 ? Math.max(0, run.requestedTrackCount - existing.size) : ids.length
          const selected = ids.filter((id) => !existing.has(id)).slice(0, needed)
          const details = selected.length ? await service.provider.getTrackDetails(selected) : []
          for (const track of details) await service.recordTrackCard(run.publicId, track)
          return details
        })
        await service.finishTrackTodoWhenReady(api, args.todoId, ctx)
        const { run } = await service.currentRun(api.conversationId)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ verified: tracks, totalVerified: service.verifiedTrackIds(run.cards).size, requested: run.requestedTrackCount }) }] }
      },
    })
    const createDraft = defineTool({
      name: 'create_playlist_draft', description: '创建可编辑的歌单草稿。只接受已核验的网易云歌曲 ID；不会发布歌单。',
      parameters: Type.Object({ todoId: Type.String(), name: Type.String({ minLength: 1, maxLength: 40 }), sourceIds: Type.Array(Type.String({ pattern: '^\\d+$' }), { minItems: 1, maxItems: 30 }) }),
      replay: 'safe',
      execute: async (args, api, ctx) => {
        const draft = await service.withTool(api, ctx, args.todoId, 'create_playlist_draft', async (item, run) => {
          if (!run.wantsPlaylist) throw new Error('用户没有要求创建歌单，只需展示可播放歌曲列表')
          const existing = await PlaylistDraftModel.findOne({ sourceTaskId: String(api.taskId) }).lean()
          if (existing) return existing
          const ids = [...new Set(args.sourceIds)]
          const verified = service.verifiedTrackIds(run.cards)
          if (ids.some((id) => !verified.has(id))) throw new Error('歌单草稿只能使用本次已核验的歌曲')
          if (run.requestedTrackCount > 1 && ids.length !== run.requestedTrackCount) throw new Error(`歌单需要恰好 ${run.requestedTrackCount} 首已核验歌曲`)
          const tracks = await service.provider.getTrackDetails(ids)
          if (tracks.length !== ids.length) throw new Error('草稿包含不存在的歌曲')
          return PlaylistDraftModel.create({ publicId: `draft_${nanoid(16)}`, accountId: item.accountId, conversationId: item.publicId, name: args.name, tracks, version: 1, status: 'DRAFT', sourceTaskId: String(api.taskId) })
        })
        await service.finishTodo(api, args.todoId, `草稿 ${draft.publicId} 已创建`, ctx)
        const { run } = await service.currentRun(api.conversationId)
        await AiRunModel.updateOne({ publicId: run.publicId }, { $addToSet: { cards: { type: 'draft', draftId: draft.publicId, name: draft.name, trackCount: draft.tracks.length } } })
        await service.appendEvent(run.publicId, 'playlist_draft.created', { draftId: draft.publicId, name: draft.name, trackCount: draft.tracks.length })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ draftId: draft.publicId, name: draft.name, trackCount: draft.tracks.length }) }] }
      },
    })
    return defineExtension({
      name: 'tmusic-music-agent',
      sections: [section('tmusic_agent', () => service.config.systemPrompt, { tag: false })],
      tools: [submitPlan, searchTracks, getTrackDetail, verifyTracks, createDraft],
    })
  }

  private async finishTodo(api: ToolExecutionApi, todoId: string, evidence: string, ctx: Context) {
    const { run } = await this.currentRun(api.conversationId)
    const successfulStep = await AiRunModel.exists({ publicId: run.publicId, steps: { $elemMatch: { todoId, status: 'SUCCEEDED' } } })
    if (!successfulStep) throw new Error('Todo 缺少成功的执行证据')
    await api.commit(async (tx) => {
      const plan = await tx.doc(PlanDoc, api.conversationId)
      const todo = plan.todos.find((item) => item.id === todoId)
      if (todo) { todo.status = 'DONE'; todo.evidence.push(evidence) }
      if (plan.todos.length && plan.todos.every((item) => item.status === 'DONE')) plan.status = 'COMPLETED'
    }, ctx)
    const plan = await this.harness.snapshot(PlanDoc, api.conversationId, context)
    if (plan) {
      await AiRunModel.updateOne({ publicId: run.publicId }, { $set: { plan: publicPlan(plan) } })
      await this.appendEvent(run.publicId, 'todo.updated', { todoId, status: 'DONE', evidence })
    }
  }

  async getDraft(id: string, accountId: string) {
    const draft = await PlaylistDraftModel.findOne({ publicId: id, accountId }).lean()
    if (!draft) throw new AgentFailure('AI_DRAFT_NOT_FOUND', '草稿不存在', 404)
    return { id: draft.publicId, name: draft.name, tracks: draft.tracks, version: draft.version, status: draft.status, publishedPlaylistId: draft.publishedPlaylistId }
  }

  async deleteDraft(id: string, accountId: string) {
    const result = await PlaylistDraftModel.deleteOne({ publicId: id, accountId, status: 'DRAFT' })
    if (!result.deletedCount) throw new AgentFailure('AI_DRAFT_NOT_EDITABLE', '草稿不能丢弃', 409)
  }

  async updateDraft(id: string, accountId: string, expectedVersion: number, name: string, sourceIds: string[]) {
    const previous = await PlaylistDraftModel.findOne({ publicId: id, accountId, status: 'DRAFT' }).lean()
    if (!previous) throw new AgentFailure('AI_DRAFT_NOT_FOUND', '草稿不存在', 404)
    if (previous.version !== expectedVersion) throw new AgentFailure('AI_DRAFT_VERSION_CONFLICT', '草稿已更新，请刷新后重试', 409)
    const ids = [...new Set(sourceIds)]
    const details = await Promise.all(ids.map((sourceId) => this.provider.getTrackDetail(sourceId)))
    if (details.some((track) => !track)) throw new AgentFailure('AI_TRACK_NOT_FOUND', '草稿包含不存在的歌曲', 422)
    const changed = await PlaylistDraftModel.findOneAndUpdate({ publicId: id, accountId, version: expectedVersion, status: 'DRAFT' }, { $set: { name, tracks: details }, $inc: { version: 1 } }, { new: true }).lean()
    if (!changed) throw new AgentFailure('AI_DRAFT_VERSION_CONFLICT', '草稿已更新，请刷新后重试', 409)
    return this.getDraft(id, accountId)
  }

  async publishDraft(id: string, identity: Identity, expectedVersion: number, idempotencyKey: string) {
    const draft = await PlaylistDraftModel.findOne({ publicId: id, accountId: identity.accountId }).lean()
    if (!draft) throw new AgentFailure('AI_DRAFT_NOT_FOUND', '草稿不存在', 404)
    if (draft.status === 'PUBLISHED' && draft.publishKey === idempotencyKey) return this.getDraft(id, identity.accountId)
    if (draft.status !== 'DRAFT' || draft.version !== expectedVersion) throw new AgentFailure('AI_DRAFT_VERSION_CONFLICT', '草稿状态已变化，请刷新后确认', 409)
    const cookie = await getNeteaseCookie(identity.credentialOwnerId)
    if (!cookie) throw new AgentFailure('NETEASE_LOGIN_REQUIRED', '请重新连接网易云账号', 401)
    const claimed = await PlaylistDraftModel.findOneAndUpdate({ publicId: id, accountId: identity.accountId, version: expectedVersion, status: 'DRAFT' }, { $set: { status: 'PUBLISHING', publishKey: idempotencyKey } }, { new: true }).lean()
    if (!claimed) throw new AgentFailure('AI_DRAFT_VERSION_CONFLICT', '草稿正在发布，请刷新后查看', 409)
    try {
      const created = await this.provider.createPlaylist(draft.name, cookie)
      for (const track of draft.tracks) await this.provider.addPlaylistTrack(created.id, track.sourceId, cookie)
      await PlaylistDraftModel.updateOne({ publicId: id, status: 'PUBLISHING', publishKey: idempotencyKey }, { $set: { status: 'PUBLISHED', publishedPlaylistId: created.id } })
      return this.getDraft(id, identity.accountId)
    } catch (error) {
      await PlaylistDraftModel.updateOne({ publicId: id, status: 'PUBLISHING' }, { $set: { status: 'NEEDS_RECONCILIATION' } })
      throw new AgentFailure('AI_PUBLISH_UNCERTAIN', '发布结果待核对，请勿重复创建', 502)
    }
  }
}
