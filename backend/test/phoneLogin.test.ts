import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NeteaseProvider } from '../src/providers/neteaseProvider'

test('phone login sends credentials in POST bodies and returns the upstream cookie', async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ path: string; method: string; body: string }> = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push({ path: url.pathname, method: init?.method || 'GET', body: String(init?.body || '') })
    if (url.pathname === '/captcha/sent') return Response.json({ code: 200 })
    if (url.pathname === '/login/cellphone') return Response.json({ code: 200, cookie: 'MUSIC_U=test; __csrf=test' })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  try {
    const provider = new NeteaseProvider()
    assert.equal((await provider.sendPhoneCaptcha('13800138000')).code, 200)
    const result = await provider.loginWithPhoneCaptcha('13800138000', '123456')
    assert.equal(result.cookie, 'MUSIC_U=test; __csrf=test')
    assert.deepEqual(requests.map(request => [request.path, request.method]), [['/captcha/sent', 'POST'], ['/login/cellphone', 'POST']])
    assert.equal(new URLSearchParams(requests[1]?.body).get('captcha'), '123456')
  } finally { globalThis.fetch = originalFetch }
})
