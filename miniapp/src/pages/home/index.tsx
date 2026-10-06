import Taro, { useDidShow } from '@tarojs/taro'
import { Image, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { catalogHome, type HomeData } from '../../lib/api'
import { usePlayer } from '../../lib/player'
import { Page } from '../../components/ui'
import background from '../../assets/aurora-home-v2.jpg'
import './index.scss'

const destinations = [
  { icon: 'pair', title: '一起听歌', subtitle: 'ふたりで聴く', path: '/pages/together/index' },
  { icon: 'ai', title: 'AI心情电台', subtitle: 'AIムードラジオ', path: '/pages/ai/index' },
  { icon: 'profile', title: '我的音乐', subtitle: 'マイライブラリ', path: '/pages/library/index' },
]

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState('')
  const [pressedButton, setPressedButton] = useState<string | null>(null)
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigationPending = useRef(false)
  const { current, playing, play, toggle } = usePlayer()

  useEffect(() => () => {
    if (animationTimer.current) clearTimeout(animationTimer.current)
    if (navigationTimer.current) clearTimeout(navigationTimer.current)
  }, [])

  const load = () => catalogHome().then(result => { setData(result); setError('') }).catch(cause => setError(cause instanceof Error ? cause.message : '音乐暂时无法加载'))
  useDidShow(() => { void load() })

  const recommendations = data?.recommendations.length ? data.recommendations : data?.guessYouLike.length ? data.guessYouLike : data?.quickPicks.length ? data.quickPicks : data?.hero ? [data.hero] : []
  const featured = current || recommendations[0] || null

  function playFeatured() {
    if (!featured) { Taro.showToast({ title: '音乐加载中，请稍后重试', icon: 'none' }); return }
    if (current?.sourceId === featured.sourceId) toggle()
    else void play(featured, recommendations)
  }

  function animateButton(button: string) {
    if (animationTimer.current) clearTimeout(animationTimer.current)
    setPressedButton(button)
    animationTimer.current = setTimeout(() => setPressedButton(null), 600)
  }

  function startListening() {
    animateButton('listen')
    if (current) { toggle(); return }
    if (!recommendations.length) { void load(); Taro.showToast({ title: '正在寻找推荐歌曲', icon: 'none' }); return }
    const selected: TrackRef = recommendations[Math.floor(Math.random() * recommendations.length)]!
    void play(selected, recommendations)
  }

  function openShortcut(path: string, icon: string) {
    if (navigationPending.current) return
    navigationPending.current = true
    animateButton(icon)
    navigationTimer.current = setTimeout(() => {
      void Taro.navigateTo({ url: path }).then(
        () => { navigationPending.current = false },
        () => { navigationPending.current = false },
      )
    }, 360)
  }

  return <Page active="/pages/home/index" theme="dark"><View className="aurora-home">
    <Image className="aurora-home-image" src={background} mode="aspectFill" />
    <View className="aurora-home-wash" />
    <View className="aurora-home-inner">
      <View className="aurora-home-heading">
        <View className="aurora-home-brand-row"><Text className="aurora-home-brand">Aurora</Text><View className="aurora-home-search" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}><View className="aurora-search-ring" /><View className="aurora-search-handle" /></View></View>
        <Text className="aurora-home-copy">让音乐陪你，{'\n'}走过每一个闪光的日子。</Text>
      </View>

      <View className="aurora-home-lower">
        <View className="aurora-glass-player">
          <View className="aurora-player-info" onClick={() => { if (current) Taro.navigateTo({ url: '/pages/player/index' }); else playFeatured() }}>
            <Image className="aurora-player-art" src={featured?.coverUrl || background} mode="aspectFill" />
            <View className="aurora-player-copy"><Text className="aurora-player-title">{featured?.name || '正在寻找你的旋律'}</Text><Text className="aurora-player-artist">{featured?.artists.map(artist => artist.name).join(' / ') || 'Aurora Music'}</Text></View>
          </View>
          <View className="aurora-player-action" hoverClass="aurora-player-action-pressed" onClick={playFeatured}><Text>{current && playing ? 'Ⅱ' : '▶'}</Text></View>
        </View>

        <View className="aurora-home-poem"><Text>有些时间，</Text><Text>只有音乐能听懂。</Text></View>

        <View className={`aurora-listen ${playing ? 'is-playing' : ''} ${pressedButton === 'listen' ? 'is-pressed' : ''}`} onClick={startListening}><View className="aurora-listen-ripple" /><View className="aurora-listen-ripple aurora-listen-ripple-late" /><View className="aurora-listen-halo"><View className="aurora-listen-core"><Text className="aurora-listen-play">{playing ? 'Ⅱ' : '▶'}</Text><Text className="aurora-listen-label">{playing ? '暂停听歌' : current ? '继续听歌' : '开始听歌'}</Text><Text className="aurora-listen-subtitle">与好音乐相遇</Text></View></View></View>

        <View className="aurora-shortcuts">{destinations.map(item => <View className={`aurora-shortcut ${pressedButton === item.icon ? 'is-pressed' : ''}`} key={item.path} onClick={() => openShortcut(item.path, item.icon)}><View className="aurora-shortcut-circle"><View className={`aurora-shortcut-glyph aurora-glyph-${item.icon}`}><View className="aurora-glyph-head" /><View className="aurora-glyph-body" /></View></View><Text className="aurora-shortcut-title">{item.title}</Text><Text className="aurora-shortcut-subtitle">{item.subtitle}</Text></View>)}</View>
        {error && <Text className="aurora-home-error" onClick={() => void load()}>{error} · 点击重试</Text>}
      </View>
    </View>
  </View></Page>
}
