import Taro, { useDidShow } from '@tarojs/taro'
import { Image, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { catalogHome, type HomeData } from '../../lib/api'
import { usePlayer } from '../../lib/player'
import { Button, Card, HERO, MiniPlayer, Notice, Page, TrackRow } from '../../components/ui'

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState(0)
  const play = usePlayer(s => s.play)
  const load = () => { catalogHome().then(setData).catch(e => setError(e.message)) }
  useDidShow(() => { load() })
  const tracks = data?.recommendations || []
  const selected: TrackRef | undefined = tracks[pick % Math.max(tracks.length, 1)] || data?.hero
  return <Page active="/pages/home/index" theme="dark"><ScrollView scrollY className="page-scroll home-scroll">
    <View className="hero"><Image src={HERO} mode="aspectFill" className="hero-image" /><View className="hero-shade" />
      <View className="hero-top"><Text className="script-logo">Aurora</Text><Text className="search-link" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>⌕</Text></View>
      <View className="hero-intro"><Text className="hero-tag">A LITTLE LIGHT FOR YOUR DAY</Text><Text className="hero-title">让音乐陪你，{ '\n' }走过每一个闪光的日子。</Text></View>
      <View className="hero-bottom"><Text>✦　 此刻，听见属于你的光</Text><Button onClick={() => { if (data?.hero) { void play(data.hero, tracks); Taro.navigateTo({ url: '/pages/player/index' }) } }}>▶ 开始聆听</Button></View>
    </View>
    <View className="home-content"><View className="section-heading"><View><Text className="eyebrow">FOR YOU</Text><Text className="heading">今天的心动旋律</Text></View><Text className="link" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>探索更多 ›</Text></View>
      {error ? <Notice text={error} retry={load} /> : !data ? <Notice text="正在寻找你的音乐…" /> : null}
      {selected && <Card className="featured-card"><View className="featured-art" onClick={() => { void play(selected, tracks); Taro.navigateTo({ url: '/pages/player/index' }) }}><Image src={selected.coverUrl || HERO} mode="aspectFill" /><View className="featured-overlay"><Text>♫  每日精选</Text><Text className="featured-title">{selected.name}</Text><Text>{selected.artists[0]?.name}</Text></View></View><View className="featured-footer"><Text>一首歌，刚好写下今天的心情</Text><Text onClick={() => setPick(pick + 1)}>换一首 ↻</Text></View></Card>}
      <View className="section-heading"><View><Text className="eyebrow">YOUR PLAYLIST</Text><Text className="heading">猜你喜欢</Text></View></View>
      {(data?.guessYouLike || []).slice(0, 4).map(track => <TrackRow key={track.sourceId} track={track} queue={data?.guessYouLike} />)}
      <Card className="invite-card" ><Text className="eyebrow">LISTEN TOGETHER</Text><Text className="heading">把此刻的心动，分享给 TA</Text><Text>同一首歌，同一个心跳频率。</Text><Button small onClick={() => Taro.redirectTo({ url: '/pages/together/index' })}>开启一起听歌 →</Button></Card>
    </View>
  </ScrollView><MiniPlayer /></Page>
}
