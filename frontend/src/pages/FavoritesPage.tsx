import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Heart, MessageCircle, Play, RefreshCw, Shuffle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { Link } from 'react-router-dom'
import { CommentsDrawer } from '../components/social/CommentsDrawer'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { Button } from '../components/ui/button'
import { formatDuration, type DemoTrack } from '../data/tracks'
import { getNeteaseLibrary } from '../lib/api'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'
import { TrackActions } from '../components/music/TrackActions'

export function FavoritesPage() {
  const [commentTrack, setCommentTrack] = useState<DemoTrack | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const account = useQuery(queries.accountStatus())
  const library = useInfiniteQuery({ ...queries.likedTracks(Number(account.data?.account?.id ?? 0)), enabled: Boolean(account.data?.authenticated) })
  const player = usePlayerStore()
  const tracks = useMemo(() => account.data?.authenticated ? library.data?.pages.flatMap((page) => page.items) ?? [] : [], [account.data?.authenticated, library.data])
  const total = library.data?.pages[0]?.total ?? 0
  const loading = account.isPending || (account.data?.authenticated && library.isPending)
  const rowVirtualizer = useVirtualizer({ count: tracks.length + (library.hasNextPage ? 1 : 0), getScrollElement: () => scrollerRef.current, estimateSize: () => 58, overscan: 8 })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const last = virtualRows.at(-1)
    if (last && last.index >= tracks.length - 5 && library.hasNextPage && !library.isFetching && !library.isFetchNextPageError) void library.fetchNextPage()
  }, [virtualRows, tracks.length, library.hasNextPage, library.isFetching, library.isFetchNextPageError, library.fetchNextPage])

  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    if (library.hasNextPage && !library.isFetching && !library.isFetchNextPageError && element.scrollHeight - element.scrollTop - element.clientHeight < 240) void library.fetchNextPage()
  }

  async function playAll(shuffle = false) {
    if (!tracks.length || actionBusy) return
    setActionBusy(true); setActionError('')
    try {
      const all = total > tracks.length ? (await getNeteaseLibrary('liked')).items as DemoTrack[] : tracks
      player.playQueue(all, shuffle ? Math.floor(Math.random() * all.length) : 0, shuffle)
    } catch (error) { setActionError(error instanceof Error ? error.message : '播放列表加载失败，请重试') }
    finally { setActionBusy(false) }
  }

  return (
    <div className="favorites-page page-with-player">
      <section className="favorites-hero">
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="eyebrow">MY COLLECTION · {loading || account.isError || (library.isError && !tracks.length) ? '…' : total} TRACKS</span>
          <div className="hero-title-row">
            <h1>我喜欢的音乐</h1>
            <span className="heart-badge"><Heart size={22} fill="currentColor" /></span>
          </div>
          <h2>每一次心动，都值得被收藏。</h2>
          <p>那些想要反复聆听的旋律，<br />都替你留在了这里。</p>
          <div className="hero-actions">
            <Button className="primary-pill" variant="aurora" size="lg" type="button" disabled={!tracks.length || actionBusy} onClick={() => void playAll()}>
              <Play size={17} fill="currentColor" /> {actionBusy ? '正在准备歌单…' : '播放全部'}
            </Button>
            <Button className="secondary-pill" variant="glass" size="lg" type="button" disabled={!tracks.length || actionBusy} onClick={() => void playAll(true)}>
              <Shuffle size={18} /> 随机播放
            </Button>
          </div>
        </div>
        <p className="hero-quote">“愿喜欢的声音，<br />陪你去很远的地方。”</p>
      </section>

      <section className="library-glass">
        <div className="filter-row favorites-source-row">
          <span>来自网易云音乐 · 喜欢列表{total ? ` · 已加载 ${tracks.length} / ${total}` : ''}</span>
          {account.data?.authenticated ? <button type="button" onClick={() => { scrollerRef.current?.scrollTo({ top: 0 }); void library.refetch() }} disabled={library.isFetching} aria-label="刷新喜欢的歌曲"><RefreshCw size={16} /> 刷新</button> : null}
        </div>

        {account.isError ? <div className="empty-state" role="alert">读取登录状态失败。<button type="button" onClick={() => void account.refetch()}>重试</button></div> : null}
        {!account.isPending && !account.isError && !account.data?.authenticated ? <div className="empty-state">连接网易云音乐后，即可同步喜欢的歌曲。<Link to="/account">前往连接账号</Link></div> : null}
        {loading ? <div className="empty-state" role="status">正在同步喜欢的歌曲…</div> : null}
        {account.data?.authenticated && library.isError && !tracks.length ? <div className="empty-state" role="alert">{library.error.message}<button type="button" onClick={() => void library.refetch()}>重试</button></div> : null}
        {actionError ? <div className="favorites-action-error" role="alert">{actionError}</div> : null}
        {account.data?.authenticated && !library.isPending && !library.isError && tracks.length === 0 ? <div className="empty-state">网易云账号中还没有喜欢的歌曲。</div> : null}

        {tracks.length > 0 ? <div className="track-table favorites-track-table" role="table" aria-label="喜欢的歌曲">
          <div className="track-table-head" role="row">
            <span>#</span><span>标题</span><span>歌手</span><span>专辑</span><span>时长</span><span />
          </div>
          <div className="favorites-list-scroller" ref={scrollerRef} onScroll={loadMoreOnScroll} aria-label="喜欢的歌曲列表">
            <div className="favorites-virtual-list" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>{virtualRows.map((row) => {
            const index = row.index
            const track = tracks[index]
            if (!track) return <div key="load-more" className="favorites-load-more" style={{ position: 'absolute', top: row.start, height: row.size, width: '100%' }}>{library.isFetchNextPageError ? <button type="button" onClick={() => void library.fetchNextPage()}>加载失败，点击重试</button> : '正在加载更多歌曲…'}</div>
            const isCurrent = player.currentId === track.id
            return (
              <div key={`${track.id}:${index}`} className={`track-row ${isCurrent ? 'is-current' : ''}`} style={{ position: 'absolute', top: 0, transform: `translateY(${row.start}px)`, width: '100%' }} role="button" tabIndex={0} aria-label={`播放 ${track.name}`} onClick={() => player.playQueue(tracks, index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); player.playQueue(tracks, index) } }}>
                <span className="track-index">{index + 1}</span>
                <span className="track-title-cell">
                  <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} />
                  <span>{track.name}</span>
                </span>
                <span className="track-muted">{track.artists.map((artist) => artist.name).join(' / ')}</span>
                <span className="track-muted">{track.album?.name}</span>
                <span className="track-duration">{formatDuration(track.durationMs)}</span>
                <div className="row-actions">
                  <TrackActions track={track} />
                  <button type="button" onClick={(event) => { event.stopPropagation(); setCommentTrack(track) }} onKeyDown={(event) => event.stopPropagation()} aria-label={`查看 ${track.name} 的评论`}><MessageCircle size={17} /></button>
                </div>
              </div>
            )
          })}</div>
          </div>
        </div> : null}
      </section>

      <CommentsDrawer track={commentTrack} onClose={() => setCommentTrack(null)} />
    </div>
  )
}
