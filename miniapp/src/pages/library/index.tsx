import Taro, { useDidShow } from '@tarojs/taro'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { accountStatus, catalogHome, createPlaylist, library, likedTracksPage, playlistTracks, type Playlist } from '../../lib/api'
import { Button, Card, HERO, MiniPlayer, Page, TrackRow } from '../../components/ui'
import { usePlayer } from '../../lib/player'
import './index.scss'

const likedPageSize = 24
const songRowRpx = 118
const visibleSongCount = 11
const cover = (url?: string | null) => url?.replace(/^http:\/\//, 'https://') || HERO
type TouchLike = { touches?: Array<{ clientX: number; clientY: number }>; changedTouches?: Array<{ clientX: number; clientY: number }> }
const fanStops = [
  { x: -36, y: -92, angle: -10, scale: 1.01, opacity: 0 },
  { x: 0, y: 0, angle: -4, scale: 1, opacity: 1 },
  { x: 10, y: 82, angle: -1, scale: .99, opacity: 1 },
  { x: 20, y: 164, angle: 1, scale: .985, opacity: 1 },
  { x: 30, y: 246, angle: 3, scale: .98, opacity: 1 },
  { x: 42, y: 328, angle: 8, scale: .97, opacity: 0 },
]
function fanStyle(relative: number, progress: number) {
  const slot = Math.max(-1, Math.min(4, relative - progress))
  const lower = Math.floor(slot)
  const upper = Math.min(4, lower + 1)
  const mix = slot - lower
  const from = fanStops[lower + 1]!
  const to = fanStops[upper + 1]!
  const value = (key: keyof typeof from) => from[key] + (to[key] - from[key]) * mix
  return {
    transform: `translate3d(${value('x')}rpx, ${value('y')}rpx, 0) rotate(${value('angle')}deg) scale(${value('scale')})`,
    opacity: value('opacity'),
    zIndex: relative + 5,
  }
}

export default function Library() {
  const [likedTracks, setLikedTracks] = useState<TrackRef[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [detail, setDetail] = useState<{ playlist: Playlist; tracks: TrackRef[] } | null>(null)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingLiked, setLoadingLiked] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState('')
  const [hasMoreLiked, setHasMoreLiked] = useState(false)
  const [likedTotal, setLikedTotal] = useState(0)
  const [visibleStart, setVisibleStart] = useState(0)
  const [error, setError] = useState('')
  const [focusedTrack, setFocusedTrack] = useState(2)
  const [playlistIndex, setPlaylistIndex] = useState(0)
  const [fanProgress, setFanProgress] = useState(0)
  const [fanDragging, setFanDragging] = useState(false)
  const [fanSettling, setFanSettling] = useState(false)
  const [wrapInId, setWrapInId] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const nextLikedOffset = useRef<number | null>(0)
  const likedGeneration = useRef(0)
  const likedRequestPending = useRef(false)
  const touchStart = useRef({ x: 0, y: 0, time: 0 })
  const didSwipe = useRef(false)
  const fanDraggingRef = useRef(false)
  const fanSettlingRef = useRef(false)
  const trackRowHeight = useRef(0)
  const fanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { current, playing, play, toggle } = usePlayer()

  useEffect(() => () => {
    if (fanTimer.current) clearTimeout(fanTimer.current)
    if (wrapTimer.current) clearTimeout(wrapTimer.current)
  }, [])

  async function load() {
    const generation = ++likedGeneration.current
    if (fanTimer.current) clearTimeout(fanTimer.current)
    if (wrapTimer.current) clearTimeout(wrapTimer.current)
    fanDraggingRef.current = false
    fanSettlingRef.current = false
    setFanDragging(false)
    setFanSettling(false)
    setFanProgress(0)
    setWrapInId(null)
    setLoading(true)
    setError('')
    setLoadMoreError('')
    setLoadingLiked(false)
    setVisibleStart(0)
    likedRequestPending.current = false
    try {
      const status = await accountStatus()
      if (generation !== likedGeneration.current) return
      setAuthenticated(status.authenticated)
      if (status.authenticated) {
        const [likedResult, playlistResult] = await Promise.allSettled([likedTracksPage(0, likedPageSize), library('playlist')])
        if (generation !== likedGeneration.current) return
        if (likedResult.status === 'fulfilled') {
          setLikedTracks(likedResult.value.items)
          setLikedTotal(likedResult.value.total)
          setHasMoreLiked(likedResult.value.nextOffset !== null)
          nextLikedOffset.current = likedResult.value.nextOffset
          setFocusedTrack(Math.min(2, Math.max(0, likedResult.value.items.length - 1)))
        } else { setLikedTracks([]); setLikedTotal(0); setHasMoreLiked(false); setError('喜欢的歌曲暂时无法加载') }
        if (playlistResult.status === 'fulfilled') { setPlaylists(playlistResult.value.items as Playlist[]); setPlaylistIndex(0) }
        else setError(previous => previous || '歌单暂时无法加载')
      } else {
        const catalog = await catalogHome()
        if (generation !== likedGeneration.current) return
        setLikedTracks(catalog.recommendations.slice(0, 8))
        setLikedTotal(catalog.recommendations.slice(0, 8).length)
        setPlaylists(catalog.playlists)
        setPlaylistIndex(0)
        setFocusedTrack(Math.min(2, Math.max(0, catalog.recommendations.length - 1)))
        setHasMoreLiked(false)
        nextLikedOffset.current = null
      }
    } catch (cause) {
      if (generation === likedGeneration.current) setError(cause instanceof Error ? cause.message : '音乐库暂时无法加载')
    } finally {
      if (generation === likedGeneration.current) setLoading(false)
    }
  }

  useDidShow(() => { void load() })

  async function loadMoreLiked(retry = false) {
    const offset = nextLikedOffset.current
    if (!authenticated || !hasMoreLiked || offset === null || likedRequestPending.current || (loadMoreError && !retry)) return
    const generation = likedGeneration.current
    likedRequestPending.current = true
    setLoadingLiked(true)
    try {
      const page = await likedTracksPage(offset, likedPageSize)
      if (generation !== likedGeneration.current) return
      nextLikedOffset.current = page.nextOffset
      setLoadMoreError('')
      setHasMoreLiked(page.nextOffset !== null)
      setLikedTotal(page.total)
      setLikedTracks(previous => {
        const seen = new Set(previous.map(track => track.sourceId))
        return [...previous, ...page.items.filter(track => !seen.has(track.sourceId))]
      })
    } catch (cause) {
      if (generation === likedGeneration.current) setLoadMoreError(cause instanceof Error ? cause.message : '加载更多歌曲失败')
    } finally {
      if (generation === likedGeneration.current) { likedRequestPending.current = false; setLoadingLiked(false) }
    }
  }

  function playLiked(track: TrackRef, index: number) {
    setFocusedTrack(index)
    if (current?.sourceId === track.sourceId) toggle()
    else void play(track, likedTracks)
  }

  function openPlaylist(playlist: Playlist) {
    if (!authenticated) { void Taro.navigateTo({ url: '/pages/account/index' }); return }
    setError('')
    void playlistTracks(playlist.id).then(result => { setDetail(result); setScrollTarget('library-top') }).catch(cause => setError(cause instanceof Error ? cause.message : '歌单加载失败'))
  }

  function turnFan(direction: number, commit: boolean) {
    const wrappedId = commit && direction > 0 && playlists.length <= 4 ? playlists[playlistIndex]?.id : null
    fanDraggingRef.current = false
    fanSettlingRef.current = true
    setFanDragging(false)
    setFanSettling(true)
    setFanProgress(commit ? direction : 0)
    if (fanTimer.current) clearTimeout(fanTimer.current)
    fanTimer.current = setTimeout(() => {
      if (wrappedId) {
        setWrapInId(wrappedId)
        if (wrapTimer.current) clearTimeout(wrapTimer.current)
        wrapTimer.current = setTimeout(() => setWrapInId(null), 40)
      }
      if (commit) setPlaylistIndex(index => (index + direction + playlists.length) % playlists.length)
      setFanProgress(0)
      setFanSettling(false)
      fanSettlingRef.current = false
      didSwipe.current = false
    }, 460)
  }

  function onDeckTouchStart(event: unknown) {
    if (fanSettlingRef.current || playlists.length < 2) return
    const point = (event as TouchLike).touches?.[0]
    if (!point) return
    touchStart.current = { x: point.clientX, y: point.clientY, time: Date.now() }
    didSwipe.current = false
    fanDraggingRef.current = true
    setFanDragging(true)
  }

  function onDeckTouchMove(event: unknown) {
    if (!fanDraggingRef.current || fanSettlingRef.current || playlists.length < 2) return
    const point = (event as TouchLike).touches?.[0]
    if (!point) return
    const dx = point.clientX - touchStart.current.x
    const dy = point.clientY - touchStart.current.y
    const distance = Math.abs(dx) > Math.abs(dy) ? dx : dy
    if (Math.abs(distance) > 8) didSwipe.current = true
    const next = playlists.length === 2 ? Math.min(1.05, Math.abs(distance) / 140) : Math.max(-1.05, Math.min(1.05, -distance / 140))
    setFanProgress(previous => Math.abs(previous - next) < .025 ? previous : next)
  }

  function onDeckTouchEnd(event: unknown) {
    if (!fanDraggingRef.current || fanSettlingRef.current || playlists.length < 2) return
    const point = (event as TouchLike).changedTouches?.[0]
    if (!point) { turnFan(0, false); return }
    const dx = point.clientX - touchStart.current.x
    const dy = point.clientY - touchStart.current.y
    const distance = Math.abs(dx) > Math.abs(dy) ? dx : dy
    if (Math.abs(distance) < 8) { fanDraggingRef.current = false; setFanDragging(false); setFanProgress(0); return }
    didSwipe.current = true
    const elapsed = Math.max(1, Date.now() - touchStart.current.time)
    const commit = Math.abs(distance) > 48 || (Math.abs(distance) > 25 && Math.abs(distance) / elapsed > .5)
    const direction = playlists.length === 2 ? 1 : distance < 0 ? 1 : -1
    turnFan(direction, commit)
  }

  const visibleEnd = Math.min(likedTracks.length, visibleStart + visibleSongCount)
  const visibleTracks = likedTracks.slice(visibleStart, visibleEnd)
  const fanSlots = playlists.length >= 6 ? [-1, 0, 1, 2, 3, 4] : playlists.length === 5 ? fanProgress < 0 ? [-1, 0, 1, 2, 3] : [0, 1, 2, 3, 4] : playlists.length === 4 ? fanProgress < 0 ? [-1, 0, 1, 2] : [0, 1, 2, 3] : playlists.length === 3 ? fanProgress < 0 ? [-1, 0, 1] : [0, 1, 2] : playlists.length === 2 ? [0, 1] : [0]

  return <Page active="/pages/library/index"><ScrollView scrollY scrollIntoView={scrollTarget} className="library-page">
    <View id="library-top" className="library-top">
      <View className="library-header"><View><Text className="library-title">音乐库</Text><Text className="library-kicker">ライブラリ</Text></View><View className="library-search" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}><View className="library-search-ring" /><View className="library-search-handle" /></View></View>
    </View>
    {error && <Text className="library-error" onClick={() => void load()}>{error} · 点击重试</Text>}

    {!detail && <>
      <View id="library-liked" className="library-liked-section"><View className="library-section-head"><Text>{authenticated ? '我喜欢的歌曲' : '为你推荐 · 登录后同步喜欢'}</Text><Text>{likedTotal ? `${likedTotal} 首` : ''}</Text></View>
        <View className="library-curve-stage"><View className="library-curve-blue" /><View className="library-curve-pink" /><View className="library-curve-dot library-curve-dot-one" /><View className="library-curve-dot library-curve-dot-two" /><View className="library-curve-dot library-curve-dot-three" />
          {likedTracks.length ? <ScrollView scrollY className="library-track-scroll" lowerThreshold={180} onScrollToLower={() => void loadMoreLiked()} onScroll={event => {
            if (!trackRowHeight.current) trackRowHeight.current = songRowRpx * Taro.getSystemInfoSync().windowWidth / 750
            const first = Math.max(0, Math.floor(event.detail.scrollTop / trackRowHeight.current) - 3)
            const focused = Math.min(likedTracks.length - 1, Math.max(0, Math.round(event.detail.scrollTop / trackRowHeight.current + 1.7)))
            setVisibleStart(previous => previous === first ? previous : first)
            setFocusedTrack(previous => previous === focused ? previous : focused)
            if (hasMoreLiked && event.detail.scrollTop + trackRowHeight.current * 10 >= likedTracks.length * trackRowHeight.current) void loadMoreLiked()
          }}><View className="library-virtual-spacer" style={{ height: `${visibleStart * songRowRpx}rpx` }} />{visibleTracks.map((track, relativeIndex) => {
            const index = visibleStart + relativeIndex
            const phase = index - focusedTrack
            const shift = Math.max(12, Math.min(95, Math.round(46 + 54 * Math.sin(phase * .72 + .5))))
            const active = index === focusedTrack
            return <View key={`${track.provider}-${track.sourceId}`} className={`library-track ${active ? 'is-active' : ''}`} style={{ transform: `translateX(${shift}rpx)` }} onClick={() => playLiked(track, index)}>
              <Image className="library-track-cover" src={cover(track.coverUrl)} mode="aspectFill" /><View className="library-track-copy"><Text className="library-track-name">{track.name}</Text><Text className="library-track-artist">{track.artists.map(artist => artist.name).join(' / ')}</Text><Text className="library-track-album">{track.album?.name || '喜欢的旋律'}</Text></View><View className="library-track-action"><Text>{current?.sourceId === track.sourceId && playing ? 'Ⅱ' : '▶'}</Text></View>
            </View>
          })}<View className="library-virtual-spacer" style={{ height: `${(likedTracks.length - visibleEnd) * songRowRpx}rpx` }} />{loadingLiked && <Text className="library-list-loading">正在加载更多歌曲…</Text>}{loadMoreError && <Text className="library-list-loading" onClick={() => void loadMoreLiked(true)}>{loadMoreError} · 点击重试</Text>}</ScrollView> : <View className="library-empty"><Text>{loading ? '正在寻找你的音乐…' : authenticated ? '还没有喜欢的歌曲' : '暂时没有推荐歌曲'}</Text>{!authenticated && <Text onClick={() => Taro.navigateTo({ url: '/pages/account/index' })}>登录网易云音乐 ›</Text>}</View>}
        </View>
      </View>

      <View id="library-playlists" className="library-playlist-section"><View className="library-section-head"><View><Text className="library-playlist-heading">{authenticated ? '我的歌单' : '精选歌单'}</Text><Text className="library-section-subtitle">属于你此刻的音乐风景。</Text></View>{authenticated && <Text className="library-create" onClick={() => setCreating(value => !value)}>＋ 新建</Text>}</View>
        {creating && <Card className="library-create-box"><Input value={name} maxlength={40} placeholder="给歌单起个名字" onInput={event => setName(event.detail.value)} /><Button small onClick={() => { if (!name.trim()) return; void createPlaylist(name.trim()).then(() => { setCreating(false); setName(''); void load() }).catch(cause => setError(cause instanceof Error ? cause.message : '创建失败')) }}>创建</Button></Card>}
        {playlists.length ? <><View className={`library-deck library-deck-count-${Math.min(4, playlists.length)} ${fanDragging ? 'is-dragging' : ''} ${fanSettling ? 'is-settling' : ''}`} catchMove onTouchStart={onDeckTouchStart} onTouchMove={onDeckTouchMove} onTouchEnd={onDeckTouchEnd} onTouchCancel={() => { if (fanDraggingRef.current) turnFan(0, false) }}>
          {fanSlots.map(relative => { const index = (playlistIndex + relative + playlists.length) % playlists.length; const item = playlists[index]!; return <View key={item.id} className={`library-deck-card library-deck-layer-${Math.max(0, Math.min(3, relative))} ${relative < 0 || relative > 3 ? 'library-deck-hidden' : ''} ${wrapInId === item.id ? 'library-deck-wrap-in' : ''}`} style={fanStyle(relative, fanProgress)} onClick={() => { if (didSwipe.current || fanSettlingRef.current || relative < 0 || relative > 3) return; if (relative) turnFan(1, true); else openPlaylist(item) }}><Image className="library-deck-image" src={cover(item.coverUrl)} mode="aspectFill" /><View className="library-deck-shade" /><View className="library-deck-content"><Text className="library-deck-name">{item.name}</Text><Text className="library-deck-description">{item.description || '每一首歌，都是一段心情。'}</Text><Text className="library-deck-count">{item.trackCount} 首</Text></View><Text className="library-deck-symbol">{relative ? '✦' : '♥'}</Text></View> })}
        </View><View className="library-deck-footer"><Text>滑动切换歌单</Text><Text>{playlistIndex + 1} / {playlists.length}</Text></View></> : <View className="library-playlist-empty" onClick={() => authenticated ? setCreating(true) : Taro.navigateTo({ url: '/pages/account/index' })}><Text>✦</Text><Text>{loading ? '正在加载歌单…' : authenticated ? '还没有歌单，创建你的第一份收藏' : '登录后查看你的歌单'}</Text></View>}
      </View>
    </>}

    {detail && <View className="library-detail"><Text className="library-detail-back" onClick={() => { setDetail(null); setScrollTarget('library-playlists') }}>‹ 返回歌单</Text><Image className="library-detail-cover" src={cover(detail.playlist.coverUrl)} mode="aspectFill" /><Text className="library-detail-title">{detail.playlist.name}</Text><Text className="library-detail-caption">{detail.tracks.length} 首歌 · {detail.playlist.description || '你的音乐收藏'}</Text><VirtualDetailTracks tracks={detail.tracks} /></View>}

  </ScrollView><MiniPlayer /></Page>
}

function VirtualDetailTracks({ tracks }: { tracks: TrackRef[] }) {
  const [start, setStart] = useState(0)
  const rowHeight = useRef(0)
  const end = Math.min(tracks.length, start + 14)
  return <ScrollView scrollY className="library-detail-scroll" onScroll={event => {
    if (!rowHeight.current) rowHeight.current = 104 * Taro.getSystemInfoSync().windowWidth / 750
    const next = Math.max(0, Math.floor(event.detail.scrollTop / rowHeight.current) - 3)
    setStart(previous => previous === next ? previous : next)
  }}><View className="library-virtual-spacer" style={{ height: `${start * 104}rpx` }} />{tracks.slice(start, end).map(track => <TrackRow key={track.sourceId} track={track} queue={tracks} />)}<View className="library-virtual-spacer" style={{ height: `${(tracks.length - end) * 104}rpx` }} /></ScrollView>
}
