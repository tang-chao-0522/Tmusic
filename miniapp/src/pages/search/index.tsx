import Taro from '@tarojs/taro'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { search, type Album, type Artist, type Playlist } from '../../lib/api'
import { Artwork, Notice, Page, TrackRow } from '../../components/ui'

const types = [['song', '单曲'], ['playlist', '歌单'], ['artist', '歌手'], ['album', '专辑']] as const
export default function Search() {
  const [q, setQ] = useState(''); const [type, setType] = useState<typeof types[number][0]>('song')
  const [items, setItems] = useState<Array<TrackRef | Playlist | Album | Artist>>([]); const [error, setError] = useState('')
  const run = (value = q, next = type) => { if (!value.trim()) return; search(value.trim(), next).then(r => setItems(r.items)).catch(e => setError(e.message)) }
  return <Page><View className="search-page"><View className="search-header"><Text onClick={() => Taro.navigateBack()}>‹</Text><Input className="search-input" value={q} onInput={e => setQ(e.detail.value)} onConfirm={() => run()} confirmType="search" placeholder="搜索歌曲、歌手或歌单" /><Text onClick={() => run()}>搜索</Text></View><View className="pills">{types.map(([value, label]) => <Text className={`pill ${type === value ? 'selected' : ''}`} key={value} onClick={() => { setType(value); run(q, value) }}>{label}</Text>)}</View><ScrollView scrollY className="search-results">{error && <Notice text={error} retry={() => run()} />}{type === 'song' ? (items as TrackRef[]).map(track => <TrackRow key={track.sourceId} track={track} queue={items as TrackRef[]} />) : items.map(item => { const entry = item as Playlist | Album | Artist; return <View className="library-row" key={entry.id}><Artwork url={entry.coverUrl} /><View><Text className="track-name">{entry.name}</Text><Text className="track-artist">{'artistName' in entry ? entry.artistName : 'trackCount' in entry ? `${entry.trackCount} 首` : `${entry.musicCount} 首`}</Text></View></View> })}{!items.length && !error && <Notice text="搜索你想听的音乐，发现新的心动。" />}</ScrollView></View></Page>
}
