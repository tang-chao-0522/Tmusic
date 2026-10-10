import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FastifyRequest } from 'fastify'
import { trackRefSchema } from '@tmusic/contracts'
import { NeteaseProvider } from '../src/providers/neteaseProvider'
import { aiSessionCookie, aiSessionFrom, createAiSession } from '../src/security/aiSession'
import { loadAgentModelConfig } from '../src/config/agentModel'
import { AiRunModel } from '../src/models/AiRun'

test('agent model settings load from the separate configuration file', async () => {
  const config = await loadAgentModelConfig()
  assert.ok(config.provider)
  assert.ok(config.modelId)
  assert.ok(config.systemPrompt.includes('submit_plan'))
  assert.ok(config.maxToolCallsPerRun > 0)
})

test('queued AI run validates before Pi assigns a submission id', async () => {
  const run = new AiRunModel({
    publicId: 'run-validation', messageId: 'message-validation', conversationId: 'conversation-validation',
    accountId: 'account-validation', clientMessageId: 'client-validation', userText: '推荐一首歌', status: 'QUEUED',
  })
  await assert.doesNotReject(run.validate())
  assert.equal(run.submissionId, undefined)
})

test('AI session accepts a signed account binding and rejects tampering', () => {
  const token = createAiSession('account-7', 'browser-7')
  const request = (cookie: string) => ({ headers: { cookie } }) as FastifyRequest
  assert.deepEqual(aiSessionFrom(request(aiSessionCookie(token))), {
    accountId: 'account-7', credentialOwnerId: 'browser-7', expiresAt: aiSessionFrom(request(aiSessionCookie(token)))?.expiresAt,
  })
  const [body, signature] = token.split('.')
  const changedBody = Buffer.from(JSON.stringify({ accountId: 'account-8', credentialOwnerId: 'browser-7', expiresAt: Date.now() + 1000 })).toString('base64url')
  assert.equal(aiSessionFrom(request(`tmusic_ai_session=${changedBody}.${signature}`)), null)
  assert.equal(aiSessionFrom(request(`tmusic_ai_session=${body}.invalid`)), null)
})

test('agent track detail uses the provider response and rejects missing songs', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname !== '/song/detail') throw new Error(`Unexpected request: ${url.pathname}`)
    const id = url.searchParams.get('ids')
    return Response.json({ code: 200, songs: id === '42' ? [{ id: 42, name: 'Real Song', ar: [{ id: 9, name: 'Artist' }], al: { id: 4, name: 'Album' }, dt: 180000 }] : [] })
  }
  try {
    const provider = new NeteaseProvider()
    const track = await provider.getTrackDetail('42')
    assert.equal(track?.sourceId, '42')
    assert.equal(track?.name, 'Real Song')
    assert.equal(trackRefSchema.safeParse(track).success, true)
    assert.equal(await provider.getTrackDetail('43'), null)
    assert.equal(await provider.getTrackDetail('not-a-number'), null)
  } finally { globalThis.fetch = originalFetch }
})
