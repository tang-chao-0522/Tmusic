import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestIntent } from '../src/agent/requestIntent'
import { NeteaseProvider } from '../src/providers/neteaseProvider'

test('ten-song recommendation requests a playable list without a playlist draft', () => {
  assert.deepEqual(requestIntent('找一些分手疗愈的歌曲十首，中文的'), { requestedTrackCount: 10, wantsPlaylist: false })
  assert.deepEqual(requestIntent('帮我创建一个十首歌的歌单'), { requestedTrackCount: 10, wantsPlaylist: true })
  assert.deepEqual(requestIntent('给我做个十首歌的歌单'), { requestedTrackCount: 10, wantsPlaylist: true })
  assert.deepEqual(requestIntent('推荐几个适合分手后听的歌单'), { requestedTrackCount: 1, wantsPlaylist: false })
})

test('batch song verification preserves requested order and drops missing IDs', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/song/detail')
    assert.equal(url.searchParams.get('ids'), '2,1,3')
    return Response.json({ code: 200, songs: [
      { id: 1, name: '第一首', ar: [{ id: 1, name: '歌手甲' }], al: { id: 1, name: '专辑' }, dt: 180000 },
      { id: 2, name: '第二首', ar: [{ id: 2, name: '歌手乙' }], al: { id: 2, name: '专辑' }, dt: 190000 },
    ] })
  }
  try {
    const tracks = await new NeteaseProvider().getTrackDetails(['2', '1', '2', '3'])
    assert.deepEqual(tracks.map((track) => track.sourceId), ['2', '1'])
    await assert.rejects(new NeteaseProvider().getTrackDetails(['localhost']))
  } finally { globalThis.fetch = originalFetch }
})
