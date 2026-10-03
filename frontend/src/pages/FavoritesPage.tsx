import { ChevronDown, Heart, MessageCircle, MoreHorizontal, Pause, Play, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CommentsDrawer } from '../components/social/CommentsDrawer'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { demoTracks, formatDuration, type DemoTrack } from '../data/tracks'
import { usePlayerStore } from '../stores/playerStore'

const moods = ['全部', '温柔', '夜行', '治愈', '轻快', '安静', '氛围', '纯音乐']

export function FavoritesPage() {
  const [mood, setMood] = useState('全部')
  const [commentTrack, setCommentTrack] = useState<DemoTrack | null>(null)
  const player = usePlayerStore()
  const visibleTracks = useMemo(
    () => (mood === '全部' ? demoTracks : demoTracks.filter((track) => track.mood === mood)),
    [mood],
  )

  return (
    <div className="favorites-page page-with-player">
      <section className="favorites-hero">
        <PageTopbar />
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="eyebrow">MY COLLECTION · {demoTracks.length} TRACKS</span>
          <div className="hero-title-row">
            <h1>我喜欢的音乐</h1>
            <span className="heart-badge"><Heart size={22} fill="currentColor" /></span>
          </div>
          <h2>每一次心动，都值得被收藏。</h2>
          <p>那些想要反复聆听的旋律，<br />都替你留在了这里。</p>
          <div className="hero-actions">
            <button className="primary-pill" type="button" onClick={() => player.play(visibleTracks[0])}>
              <Play size={17} fill="currentColor" /> 播放全部
            </button>
            <button className="secondary-pill" type="button" onClick={player.toggleShuffle}>
              <Shuffle size={18} /> 随机播放
            </button>
            <button className="round-more" type="button" aria-label="更多"><MoreHorizontal size={20} /></button>
          </div>
        </div>
        <p className="hero-quote">“愿喜欢的声音，<br />陪你去很远的地方。”</p>
      </section>

      <section className="library-glass">
        <div className="filter-row">
          <div className="mood-tabs" role="tablist" aria-label="歌曲风格">
            {moods.map((item) => (
              <button key={item} type="button" className={mood === item ? 'active' : ''} onClick={() => setMood(item)}>
                {item}
              </button>
            ))}
          </div>
          <button className="sort-button" type="button">最近添加 <ChevronDown size={16} /></button>
        </div>

        <div className="track-table" role="table" aria-label="喜欢的歌曲">
          <div className="track-table-head" role="row">
            <span>#</span><span>标题</span><span>歌手</span><span>专辑</span><span>时长</span><span />
          </div>
          {visibleTracks.map((track, index) => {
            const isCurrent = player.currentId === track.id
            return (
              <div key={track.id} className={`track-row ${isCurrent ? 'is-current' : ''}`} role="row">
                <button className="track-index" type="button" onClick={() => isCurrent ? player.toggle() : player.play(track)} aria-label={`播放 ${track.name}`}>
                  {isCurrent ? (player.isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />) : index + 1}
                </button>
                <button className="track-title-cell" type="button" onClick={() => player.play(track)}>
                  <TrackArtwork palette={track.palette} />
                  <span>{track.name}</span>
                </button>
                <span className="track-muted">{track.artists.map((artist) => artist.name).join(' / ')}</span>
                <span className="track-muted">{track.album?.name}</span>
                <span className="track-duration">{formatDuration(track.durationMs)}</span>
                <div className="row-actions">
                  <Heart size={17} fill="currentColor" />
                  <button type="button" onClick={() => setCommentTrack(track)} aria-label="查看评论"><MessageCircle size={17} /></button>
                  <button type="button" aria-label="更多"><MoreHorizontal size={18} /></button>
                </div>
              </div>
            )
          })}
          {visibleTracks.length === 0 ? <div className="empty-state">这个分类里还没有收藏歌曲。</div> : null}
        </div>
      </section>

      <CommentsDrawer track={commentTrack} onClose={() => setCommentTrack(null)} />
    </div>
  )
}
