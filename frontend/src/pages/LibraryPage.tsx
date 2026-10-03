import { useQuery } from '@tanstack/react-query'
import { Disc3, Heart, ListMusic, MoreHorizontal, Play, UserRound } from 'lucide-react'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { demoTracks } from '../data/tracks'
import { getPlaylists } from '../lib/api'
import { usePlayerStore } from '../stores/playerStore'

const fallback = [
  { id: 'spring', name: '春日回声', description: '那时的空气、光，以及音乐。', trackCount: 72, durationText: '4小时32分', coverUrl: null },
  { id: 'night', name: '夜行歌单', description: '给睡不着的夜，一些安静陪伴。', trackCount: 56, durationText: '3小时48分', coverUrl: null },
  { id: 'drive', name: '公路速写', description: '去往哪里都好，让声音带你向前。', trackCount: 41, durationText: '2小时35分', coverUrl: null },
  { id: 'cafe', name: '咖啡馆小憩', description: '咖啡香气与轻柔旋律。', trackCount: 38, durationText: '2小时21分', coverUrl: null },
]

export function LibraryPage() {
  const { data } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists })
  const playlists = data?.items ?? fallback
  const play = usePlayerStore((state) => state.play)
  return <div className="immersive-page library-page-v2 page-with-player">
    <PageTopbar /><div className="ambient-petals" />
    <section className="library-title"><h1>音乐库</h1><p>我的音乐，随时都在这里。</p></section>
    <nav className="library-tabs"><button className="active"><ListMusic />歌单</button><button><Disc3 />专辑</button><button><UserRound />歌手</button><button><Heart />喜欢</button></nav>
    <section className="featured-playlist glass-panel">
      <TrackArtwork palette={demoTracks[0]!.palette} className="featured-art" />
      <div><span className="tag">精选歌单</span><h2>{playlists[0]?.name}</h2><p>{playlists[0]?.description}</p><small>澪 · {playlists[0]?.trackCount} 首 · {playlists[0]?.durationText}</small></div>
      <p className="featured-quote">让声音，<br />带你重回那片天空。</p>
      <button className="featured-play" type="button" onClick={() => play(demoTracks[0])}><Play fill="currentColor" /></button><button className="featured-more" type="button"><MoreHorizontal /></button>
    </section>
    <section className="playlist-section"><header><h2>全部歌单 <small>{playlists.length}</small></h2><button>最近添加</button></header>
      <div>{playlists.map((item, index) => <button className={`playlist-row ${index === 0 ? 'active' : ''}`} key={item.id} type="button" onClick={() => play(demoTracks[index % demoTracks.length])}>
        <span className="equalizer">▥</span><TrackArtwork palette={demoTracks[index % demoTracks.length]!.palette} /><span><strong>{item.name}</strong><small>{item.trackCount} 首 · {item.durationText}</small></span><em>{item.description}</em><MoreHorizontal />
      </button>)}</div>
    </section>
  </div>
}
