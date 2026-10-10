import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCustomBaseUrl, userModelInputSchema, maskApiKey } from '../src/agent/customModel'
import { encryptCredential, decryptCredential } from '../src/security/credentialCipher'

test('custom model input accepts a provider endpoint and optional key rotation', () => {
  const input = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'my-model' }
  assert.equal(userModelInputSchema.safeParse(input).success, true)
  assert.equal(userModelInputSchema.safeParse({ ...input, provider: 'anthropic-compatible' }).success, true)
  assert.equal(userModelInputSchema.safeParse({ ...input, apiKey: 'sk-example1234' }).success, true)
  assert.equal(userModelInputSchema.safeParse({ ...input, provider: 'unknown' }).success, false)
})

test('custom model endpoint rejects local addresses and URL credentials', () => {
  assert.equal(normalizeCustomBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1')
  for (const value of ['http://api.example.com/v1', 'https://127.0.0.1/v1', 'https://localhost/v1', 'https://user:pass@api.example.com/v1', 'https://api.example.com/v1?key=secret']) {
    assert.throws(() => normalizeCustomBaseUrl(value))
  }
})

test('custom API key is recoverable from AES-GCM ciphertext and public mask omits it', () => {
  const key = 'sk-secret-value-abcd'
  const encrypted = encryptCredential(key)
  assert.equal(decryptCredential(encrypted), key)
  assert.equal(JSON.stringify(encrypted).includes(key), false)
  assert.equal(maskApiKey(key.slice(-4)), 'sk-****abcd')
  assert.throws(() => decryptCredential({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') }))
})
