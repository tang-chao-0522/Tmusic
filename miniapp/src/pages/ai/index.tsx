import Taro from '@tarojs/taro'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { search } from '../../lib/api'
import { MiniPlayer, Page, TrackRow } from '../../components/ui'

const moods = ['治愈', '日系', '学习', '睡前', 'emo', '清晨', 'City Pop', '钢琴']
export default function Ai() {
  const [selected, setSelected] = useState('治愈'); const [input, setInput] = useState(''); const [title, setTitle] = useState('适合一个人听的明亮歌曲'); const [tracks, setTracks] = useState<TrackRef[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const generate = (query: string) => { if (!query.trim()) return; setTitle(query); setBusy(true); setError(''); search(query, 'song').then(data => setTracks(data.items as TrackRef[])).catch(e => setError(e.message)).finally(() => setBusy(false)) }
  return <Page active="/pages/ai/index"><ScrollView scrollY className="page-scroll content-scroll"><View className="ai-top"><Text className="script-logo">Aurora AI</Text><Text onClick={() => Taro.redirectTo({ url: '/pages/account/index' })}>⋯</Text></View><View className="ai-orb">✦</View><Text className="page-title">你好，我是 Aurora。</Text><Text className="page-subtitle">告诉我你现在的心情，我陪你找到适合的旋律。</Text><View className="ai-prompt"><Input value={input} placeholder="比如：想听一些温柔的日系歌曲" onInput={e => setInput(e.detail.value)} onConfirm={() => generate(input)} /><Text onClick={() => generate(input || selected)}>➤</Text></View><View className="mood-grid">{moods.map(mood => <Text key={mood} className={`mood ${selected === mood ? 'selected' : ''}`} onClick={() => { setSelected(mood); generate(mood) }}>{mood}</Text>)}</View><View className="section-heading"><Text className="heading">为你生成的歌单</Text><Text className="link" onClick={() => generate(selected)}>换一换 ↻</Text></View><Text className="page-subtitle">{busy ? '正在寻找旋律…' : title}</Text>{error && <Text className="error-text">{error}</Text>}{tracks.map(track => <TrackRow key={track.sourceId} track={track} queue={tracks} />)}{!tracks.length && !busy && <View className="ai-preview" onClick={() => generate(selected)}>✧　点选心情，让音乐开始流动</View>}<Text className="ai-note">根据现有曲库搜索生成推荐</Text></ScrollView><MiniPlayer /></Page>
}
