import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NeteaseProvider } from '../src/providers/neteaseProvider'

test('liked pages request only their song details and preserve liked order', async () => {
  const originalFetch = globalThis.fetch
  const detailRequests: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/login/status') return Response.json({ data: { account: { id: 7 }, profile: { userId: 7 } } })
    if (url.pathname === '/likelist') return Response.json({ code: 200, ids: [1, 2, 3, 4] })
    if (url.pathname === '/song/detail') {
      const ids = url.searchParams.get('ids') ?? ''
      detailRequests.push(ids)
      return Response.json({ code: 200, songs: ids.split(',').reverse().filter((id) => id !== '4').map((id) => ({ id: Number(id), name: `Song ${id}` })) })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }

  try {
    const provider = new NeteaseProvider()
    const middle = await provider.getLikedTracksPage('cookie=value', 1, 2)
    assert.deepEqual(middle.items.map((item) => item.sourceId), ['2', '3'])
    assert.equal(middle.total, 4)
    assert.equal(middle.nextOffset, 3)

    const last = await provider.getLikedTracksPage('cookie=value', 3, 2)
    assert.deepEqual(last.items, [])
    assert.equal(last.nextOffset, null)
    assert.deepEqual(detailRequests, ['2,3', '4'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
