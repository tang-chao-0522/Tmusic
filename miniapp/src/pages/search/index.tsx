import Taro from '@tarojs/taro'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { catalogTracks, search, type Album, type Artist, type Playlist } from '../../lib/api'
import { Artwork, Notice, Page, TrackRow } from '../../components/ui'

const types = [['song', '单曲'], ['playlist', '歌单'], ['artist', '歌手'], ['album', '专辑']] as const
export default function Search() {
  const [q, setQ] = useState(''); const [type, setType] = useState<typeof types[number][0]>('song')
  const [items, setItems] = useState<Array<TrackRef | Playlist | Album | Artist>>([]); const [error, setError] = useState('')
  const [selected, setSelected] = useState<{ type: 'playlist' | 'artist' | 'album'; id: string; entry: Playlist | Album | Artist } | null>(null)
  const [detail, setDetail] = useState<{ item: Playlist | Album | Artist; tracks: TrackRef[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const run = (value = q, next = type) => { setSelected(null); setDetail(null); setError(''); if (!value.trim()) { setItems([]); return }; search(value.trim(), next).then(r => setItems(r.items)).catch(e => setError(e.message)) }
  const open = (entry: Playlist | Album | Artist) => { const target = { type: type as 'playlist' | 'artist' | 'album', id: entry.id, entry }; setSelected(target); setDetail(null); setError(''); setLoadingDetail(true); catalogTracks(target.type, target.id).then(setDetail).catch(e => setError(e.message)).finally(() => setLoadingDetail(false)) }
  return <Page><View className="search-page"><View className="search-header"><Text onClick={() => selected ? (setSelected(null), setDetail(null), setError('')) : Taro.navigateBack()}>‹</Text><Input className="search-input" value={q} onInput={e => setQ(e.detail.value)} onConfirm={() => run()} confirmType="search" placeholder="搜索歌曲、歌手或歌单" /><Text onClick={() => run()}>搜索</Text></View>{selected ? <><View className="pills"><Text className="pill selected">{detail?.item.name ?? selected.entry.name}</Text><Text>{detail?.tracks.length ?? 0} 首</Text></View><ScrollView scrollY className="search-results">{loadingDetail && <Notice text="正在加载歌曲列表…" />}{error && <Notice text={error} retry={() => open(selected.entry)} />}{detail && (detail.tracks.length ? detail.tracks.map(track => <TrackRow key={track.sourceId} track={track} queue={detail.tracks} />) : <Notice text="暂无歌曲" />)}</ScrollView></> : <><View className="pills">{types.map(([value, label]) => <Text className={`pill ${type === value ? 'selected' : ''}`} key={value} onClick={() => { setType(value); run(q, value) }}>{label}</Text>)}</View><ScrollView scrollY className="search-results">{error && <Notice text={error} retry={() => run()} />}{type === 'song' ? (items as TrackRef[]).map(track => <TrackRow key={track.sourceId} track={track} queue={items as TrackRef[]} />) : items.map(item => { const entry = item as Playlist | Album | Artist; return <View className="library-row" key={entry.id} onClick={() => open(entry)}><Artwork url={entry.coverUrl} /><View><Text className="track-name">{entry.name}</Text><Text className="track-artist">{'artistName' in entry ? entry.artistName : 'trackCount' in entry ? `${entry.trackCount} 首` : `${entry.musicCount} 首`}</Text></View></View> })}{!items.length && !error && <Notice text="搜索你想听的音乐，发现新的心动。" />}</ScrollView></>}</View></Page>
}
