import { useQuery } from '@tanstack/react-query'
import { Heart, MessageCircle, Pause, Play, RefreshCw, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CommentsDrawer } from '../components/social/CommentsDrawer'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { Button } from '../components/ui/button'
import { formatDuration, type DemoTrack } from '../data/tracks'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

export function FavoritesPage() {
  const [commentTrack, setCommentTrack] = useState<DemoTrack | null>(null)
  const account = useQuery(queries.accountStatus())
  const library = useQuery({
    ...queries.library(Number(account.data?.account?.id ?? 0), 'liked'),
    enabled: Boolean(account.data?.authenticated),
  })
  const player = usePlayerStore()
  const tracks = account.data?.authenticated && !account.isError && !library.isError ? (library.data?.items as DemoTrack[] | undefined) ?? [] : []
  const loading = account.isPending || (account.data?.authenticated && library.isPending)

  return (
    <div className="favorites-page page-with-player">
      <section className="favorites-hero">
        <PageTopbar />
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="eyebrow">MY COLLECTION · {loading || account.isError || library.isError ? '…' : tracks.length} TRACKS</span>
          <div className="hero-title-row">
            <h1>我喜欢的音乐</h1>
            <span className="heart-badge"><Heart size={22} fill="currentColor" /></span>
          </div>
          <h2>每一次心动，都值得被收藏。</h2>
          <p>那些想要反复聆听的旋律，<br />都替你留在了这里。</p>
          <div className="hero-actions">
            <Button className="primary-pill" variant="aurora" size="lg" type="button" disabled={!tracks.length} onClick={() => player.playQueue(tracks)}>
              <Play size={17} fill="currentColor" /> 播放全部
            </Button>
            <Button className="secondary-pill" variant="glass" size="lg" type="button" disabled={!tracks.length} onClick={() => player.playQueue(tracks, Math.floor(Math.random() * tracks.length), true)}>
              <Shuffle size={18} /> 随机播放
            </Button>
          </div>
        </div>
        <p className="hero-quote">“愿喜欢的声音，<br />陪你去很远的地方。”</p>
      </section>

      <section className="library-glass">
        <div className="filter-row favorites-source-row">
          <span>来自网易云音乐 · 喜欢列表</span>
          {account.data?.authenticated ? <button type="button" onClick={() => void library.refetch()} disabled={library.isFetching} aria-label="刷新喜欢的歌曲"><RefreshCw size={16} /> 刷新</button> : null}
        </div>

        {account.isError ? <div className="empty-state" role="alert">读取登录状态失败。<button type="button" onClick={() => void account.refetch()}>重试</button></div> : null}
        {!account.isPending && !account.isError && !account.data?.authenticated ? <div className="empty-state">连接网易云音乐后，即可同步喜欢的歌曲。<Link to="/account">前往连接账号</Link></div> : null}
        {loading ? <div className="empty-state" role="status">正在同步喜欢的歌曲…</div> : null}
        {account.data?.authenticated && library.isError ? <div className="empty-state" role="alert">{library.error.message}<button type="button" onClick={() => void library.refetch()}>重试</button></div> : null}
        {account.data?.authenticated && !library.isPending && !library.isError && tracks.length === 0 ? <div className="empty-state">网易云账号中还没有喜欢的歌曲。</div> : null}

        {tracks.length > 0 ? <div className="track-table" role="table" aria-label="喜欢的歌曲">
          <div className="track-table-head" role="row">
            <span>#</span><span>标题</span><span>歌手</span><span>专辑</span><span>时长</span><span />
          </div>
          {tracks.map((track, index) => {
            const isCurrent = player.currentId === track.id
            return (
              <div key={track.id} className={`track-row ${isCurrent ? 'is-current' : ''}`} role="row">
                <button className="track-index" type="button" onClick={() => isCurrent ? player.toggle() : player.playQueue(tracks, index)} aria-label={`${isCurrent && player.isPlaying ? '暂停' : '播放'} ${track.name}`}>
                  {isCurrent ? (player.isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />) : index + 1}
                </button>
                <button className="track-title-cell" type="button" onClick={() => player.playQueue(tracks, index)}>
                  <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} />
                  <span>{track.name}</span>
                </button>
                <span className="track-muted">{track.artists.map((artist) => artist.name).join(' / ')}</span>
                <span className="track-muted">{track.album?.name}</span>
                <span className="track-duration">{formatDuration(track.durationMs)}</span>
                <div className="row-actions">
                  <Heart size={17} fill="currentColor" aria-label="已喜欢" />
                  <button type="button" onClick={() => setCommentTrack(track)} aria-label={`查看 ${track.name} 的评论`}><MessageCircle size={17} /></button>
                </div>
              </div>
            )
          })}
        </div> : null}
      </section>

      <CommentsDrawer track={commentTrack} onClose={() => setCommentTrack(null)} />
    </div>
  )
}
