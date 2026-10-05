import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NeteaseProvider } from '../src/providers/neteaseProvider'

test('playlist detail uses full track IDs in order and writes only to owned playlists', async () => {
  const originalFetch = globalThis.fetch
  const paths: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    paths.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/login/status') return Response.json({ data: { account: { id: 7 }, profile: { userId: 7 } } })
    if (url.pathname === '/user/playlist') return Response.json({ code: 200, playlist: [
      { id: 10, name: 'Mine', creator: { userId: 7 } },
      { id: 11, name: 'Saved', creator: { userId: 8 } },
    ] })
    if (url.pathname === '/playlist/tracks') return Response.json({ code: 200 })
    if (url.pathname === '/playlist/detail') return Response.json({ code: 200, playlist: { id: 10, name: 'Mine', creator: { userId: 7 }, trackIds: [{ id: 3 }, { id: 1 }, { id: 2 }], tracks: [{ id: 3 }] } })
    if (url.pathname === '/song/detail') return Response.json({ code: 200, songs: [{ id: 2, name: 'Two' }, { id: 1, name: 'One' }, { id: 3, name: 'Three' }] })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  try {
    const provider = new NeteaseProvider()
    const detail = await provider.getPlaylistTracks('10', 'cookie=value')
    assert.deepEqual(detail.tracks.map((track) => track.sourceId), ['3', '1', '2'])
    await provider.addPlaylistTrack('10', '3', 'cookie=value')
    await assert.rejects(provider.addPlaylistTrack('11', '3', 'cookie=value'), /PLAYLIST_NOT_OWNED/)
    assert.equal(paths.filter((path) => path.startsWith('/playlist/tracks')).length, 1)
  } finally { globalThis.fetch = originalFetch }
})

test('heart requests pass the selected state to the Netease API', async () => {
  const originalFetch = globalThis.fetch
  const likes: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/login/status') return Response.json({ data: { account: { id: 7 }, profile: { userId: 7 } } })
    if (url.pathname === '/like') { likes.push(`${url.searchParams.get('id')}:${url.searchParams.get('like')}`); return Response.json({ code: 200 }) }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  try {
    const provider = new NeteaseProvider()
    await provider.setLiked('42', true, 'cookie=value')
    await provider.setLiked('42', false, 'cookie=value')
    assert.deepEqual(likes, ['42:true', '42:false'])
  } finally { globalThis.fetch = originalFetch }
})
