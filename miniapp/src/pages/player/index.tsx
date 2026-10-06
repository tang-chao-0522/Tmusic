import Taro, { useDidShow } from '@tarojs/taro'
import { Image, ScrollView, Slider, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { lyrics, setLiked } from '../../lib/api'
import { usePlayer } from '../../lib/player'
import { HERO, Page } from '../../components/ui'

function time(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` }
function parseLrc(raw: string) { return raw.split('\n').map(line => { const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/); return match ? { at: Number(match[1]) * 60 + Number(match[2]), text: match[3]?.trim() || '♪' } : null }).filter((line): line is { at: number; text: string } => !!line) }
export default function Player() {
  const { current, queue, playing, progress, duration, error, shuffle, repeat, toggle, next, previous, seek, toggleShuffle, toggleRepeat } = usePlayer()
  const [lines, setLines] = useState<Array<{ at: number; text: string }>>([])
  const [liked, setLocalLiked] = useState(false); const [showLyrics, setShowLyrics] = useState(false); const [showQueue, setShowQueue] = useState(false)
  useDidShow(() => { if (!current) Taro.navigateBack() })
  useEffect(() => { setLines([]); if (current) lyrics(current.sourceId).then(data => setLines(parseLrc(data.original))).catch(() => undefined) }, [current?.sourceId])
  const currentLine = Math.max(0, lines.findIndex((line, i) => progress >= line.at && (!lines[i + 1] || progress < lines[i + 1]!.at)))
  return <Page theme="dark"><View className="player-page"><Image src={current?.coverUrl || HERO} className="player-bg" mode="aspectFill" /><View className="player-shade" />
    <View className="player-header"><Text onClick={() => Taro.navigateBack()}>⌄</Text><View><Text>NOW PLAYING</Text><Text className="player-header-title">{current?.name || '播放页'}</Text></View><Text onClick={() => setShowQueue(!showQueue)}>⋯</Text></View>
    <View className="player-main" onClick={() => setShowLyrics(!showLyrics)}>{showQueue ? <ScrollView scrollY className="lyrics-view"><Text className="heading">播放队列</Text>{queue.map((track, i) => <View className="queue-item" key={`${track.sourceId}-${i}`} onClick={e => { e.stopPropagation(); void usePlayer.getState().play(track, queue); setShowQueue(false) }}><Text>{i + 1}　{track.name}</Text><Text>{track.artists[0]?.name}</Text></View>)}</ScrollView> : showLyrics ? <ScrollView scrollY className="lyrics-view">{lines.length ? lines.map((line, i) => <Text key={i} className={`lyric-line ${i === currentLine ? 'current' : ''}`}>{line.text}</Text>) : <Text className="lyric-line current">暂无歌词</Text>}</ScrollView> : <View className="cover-centered"><Image src={current?.coverUrl || HERO} mode="aspectFill" className="player-cover" /><Text className="player-song">{current?.name}</Text><Text>{current?.artists.map(a => a.name).join(' / ')}</Text><Text className="player-poem">有些旋律，刚好替你说出心事。</Text></View>}</View>
    <View className="player-controls"><View className="player-track-pill"><Text>♫　{current?.name}</Text><Text onClick={() => { if (current) { const value = !liked; setLocalLiked(value); setLiked(current.sourceId, value).catch(() => setLocalLiked(!value)) } }}>{liked ? '♥' : '♡'}</Text></View>{error && <Text className="player-error">{error}</Text>}
      <Slider min={0} max={Math.max(1, Math.floor(duration || (current?.durationMs || 0) / 1000))} value={Math.floor(progress)} activeColor="#dda8ff" backgroundColor="#ffffff66" blockSize={14} onChange={e => seek(e.detail.value)} /><View className="time-row"><Text>{time(progress)}</Text><Text>{time(duration || (current?.durationMs || 0) / 1000)}</Text></View>
      <View className="transport"><Text className={shuffle ? 'transport-active' : ''} onClick={toggleShuffle}>⤨</Text><Text onClick={previous}>Ⅰ◀</Text><Text className="play-circle" onClick={toggle}>{playing ? 'Ⅱ' : '▶'}</Text><Text onClick={next}>▶Ⅰ</Text><Text className={repeat ? 'transport-active' : ''} onClick={toggleRepeat}>↻</Text></View>
      <View className="player-tools"><Text onClick={() => setShowLyrics(!showLyrics)}>歌词</Text><Text onClick={() => setShowQueue(!showQueue)}>播放列表</Text><Text onClick={() => Taro.redirectTo({ url: '/pages/together/index' })}>一起听歌</Text></View>
    </View>
  </View></Page>
}
