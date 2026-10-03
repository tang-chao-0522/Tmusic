import { useQuery } from '@tanstack/react-query'
import { ArrowRight, MoreHorizontal, Play, Plus } from 'lucide-react'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { demoTracks } from '../data/tracks'
import { getCatalogHome } from '../lib/api'
import { usePlayerStore } from '../stores/playerStore'

export function DiscoverPage() {
  const play = usePlayerStore((state) => state.play)
  const { data, isError, refetch } = useQuery({
    queryKey: ['catalog-home'], queryFn: getCatalogHome,
    refetchInterval: (query) => query.state.data?.degraded ? 10_000 : false,
  })
  const hero = data?.hero ?? demoTracks[0]!
  const recent = data?.continueListening ?? demoTracks.slice(0, 2)
  const picks = data?.quickPicks ?? demoTracks.slice(2, 6)

  return (
    <div className="immersive-page home-page page-with-player">
      <PageTopbar /><div className="ambient-petals" />
      <section className="home-copy">
        <span className="eyebrow">FEATURED TODAY</span><h1>{hero.name}</h1><h2>{hero.artists[0]?.name}</h2>
        <p>「那些曾听见的声音，<br />仍在某处轻轻回响。」</p>
        <div className="hero-actions">
          <button className="primary-pill" type="button" onClick={() => play(hero)}><Play size={17} fill="currentColor" />播放</button>
          <button className="secondary-pill" type="button"><Plus size={18} />收藏到音乐库</button>
          <button className="round-more" type="button" aria-label="更多"><MoreHorizontal /></button>
        </div>
      </section>
      <p className="home-poem">声音会带我们<br />再一次，抵达那片天空。</p>
      <section className="home-hub glass-panel">
        <div className="hub-column">
          <header><h3>继续聆听</h3><ArrowRight size={18} /></header>
          {recent.map((track, index) => <button className="continue-row" key={track.id} type="button" onClick={() => play(track)}>
            <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} /><span><strong>{track.name}</strong><small>{track.artists[0]?.name}</small></span>
            <i><b style={{ width: `${index ? 31 : 56}%` }} /></i><em>{index ? '1:12' : '2:34'} / {index ? '4:18' : '5:21'}</em>
          </button>)}
        </div>
        <div className="hub-column quick-column">
          <header><h3>随心挑选</h3><ArrowRight size={18} /></header>
          {picks.slice(0, 3).map((track) => <button className="quick-row" key={track.id} type="button" onClick={() => play(track)}>
            <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} /><span><strong>{track.name}</strong><small>{track.artists[0]?.name}</small></span>
            <i><Play size={15} /></i><MoreHorizontal size={18} />
          </button>)}
        </div>
      </section>
      {(data?.degraded || isError) && <button className="data-notice" type="button" onClick={() => void refetch()}>网易云连接中 · 当前为预览数据，点击重试</button>}
    </div>
  )
}
