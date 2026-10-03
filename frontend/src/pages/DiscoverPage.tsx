import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Play, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackListItem } from '../components/music/TrackListItem'
import { GlassPanel } from '../components/shared/GlassPanel'
import { SectionHeading } from '../components/shared/SectionHeading'
import { Button } from '../components/ui/button'
import { demoTracks, type DemoTrack } from '../data/tracks'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

export function DiscoverPage() {
  const play = usePlayerStore((state) => state.play)
  const { data, isError, refetch } = useQuery(queries.catalogHome())
  const hero = data?.hero ?? demoTracks[0]!
  const recommendations = data?.recommendations ?? demoTracks
  const suggestions = useMemo(() => data?.guessYouLike ?? demoTracks.slice(0, 2), [data?.guessYouLike])
  const randomPool = useMemo(() => recommendations.filter((track) => !suggestions.some((item) => item.id === track.id)), [recommendations, suggestions])
  const [randomPicks, setRandomPicks] = useState<DemoTrack[]>([])

  useEffect(() => {
    setRandomPicks(sampleTracks(randomPool))
  }, [randomPool])

  const picks = randomPicks.length ? randomPicks : randomPool.slice(0, 3)

  return (
    <div className="immersive-page home-page page-with-player">
      <PageTopbar /><div className="ambient-petals" />
      <section className="home-copy">
        <span className="eyebrow">FEATURED TODAY</span><h1>{hero.name}</h1><h2>{hero.artists[0]?.name}</h2>
        <p>「那些曾听见的声音，<br />仍在某处轻轻回响。」</p>
        <div className="hero-actions">
          <Button className="primary-pill" variant="aurora" size="lg" type="button" onClick={() => play(hero)}><Play size={17} fill="currentColor" />播放</Button>
          <Button className="secondary-pill" variant="glass" size="lg" type="button"><Plus size={18} />收藏到音乐库</Button>
          <button className="round-more" type="button" aria-label="更多"><MoreHorizontal /></button>
        </div>
      </section>
      <p className="home-poem">声音会带我们<br />再一次，抵达那片天空。</p>
      <GlassPanel as="section" className="home-hub">
        <div className="hub-column">
          <SectionHeading title="猜你喜欢" />
          {suggestions.map((track) => <TrackListItem key={track.id} track={track} variant="recommend" onPlay={() => play(track)} />)}
        </div>
        <div className="hub-column quick-column">
          <SectionHeading title="随心挑选" action={<button className="hub-refresh" type="button" onClick={() => setRandomPicks((current) => sampleTracks(randomPool, current))} aria-label="刷新随心挑选" title="换一批"><RefreshCw size={18} /></button>} />
          {picks.map((track) => <TrackListItem key={track.id} track={track} variant="quick" onPlay={() => play(track)} />)}
        </div>
      </GlassPanel>
      {(data?.degraded || isError) && <button className="data-notice" type="button" onClick={() => void refetch()}>网易云连接中 · 当前为预览数据，点击重试</button>}
    </div>
  )
}

function sampleTracks(pool: DemoTrack[], previous: DemoTrack[] = []) {
  const count = Math.min(3, pool.length)
  const previousIds = new Set(previous.map((track) => track.id))
  const fresh = pool.filter((track) => !previousIds.has(track.id))
  const candidates = fresh.length >= count ? fresh : pool
  const shuffled = [...candidates]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]!, shuffled[index]!]
  }
  const selected = shuffled.slice(0, count)
  if (count > 1 && selected.every((track, index) => track.id === previous[index]?.id)) selected.push(selected.shift()!)
  return selected
}
