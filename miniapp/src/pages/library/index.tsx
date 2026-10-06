import Taro, { useDidShow } from '@tarojs/taro'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import { useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { accountStatus, createPlaylist, library, playlistTracks, type Album, type Artist, type LibraryKind, type Playlist } from '../../lib/api'
import { Artwork, Button, Card, MiniPlayer, Notice, Page, TrackRow } from '../../components/ui'

const tabs: Array<[LibraryKind, string]> = [['playlist', '歌单'], ['liked', '心情'], ['album', '专辑'], ['artist', '歌手']]
export default function Library() {
  const [kind, setKind] = useState<LibraryKind>('playlist')
  const [items, setItems] = useState<Array<TrackRef | Playlist | Album | Artist>>([])
  const [detail, setDetail] = useState<{ playlist: Playlist; tracks: TrackRef[] } | null>(null)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const load = (next: LibraryKind) => { setError(''); accountStatus().then(status => { setAuthenticated(status.authenticated); if (status.authenticated) return library(next).then(result => setItems(result.items)); setItems([]) }).catch(e => setError(e.message)) }
  useDidShow(() => load(kind))
  const open = (id: string) => { playlistTracks(id).then(setDetail).catch(e => setError(e.message)) }
  return <Page active="/pages/library/index"><ScrollView scrollY className="page-scroll content-scroll"><View className="top-line"><View><Text className="eyebrow">MY MUSIC</Text><Text className="page-title">音乐库</Text></View><Text className="top-icon" onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>⌕</Text></View>
    <Text className="page-subtitle">收藏每一段与你相遇的旋律。</Text>
    <View className="pills">{tabs.map(([value, label]) => <Text key={value} className={`pill ${kind === value ? 'selected' : ''}`} onClick={() => { setKind(value); setDetail(null); load(value) }}>{label}</Text>)}</View>
    {error && <Notice text={error} retry={() => load(kind)} />}
    {authenticated === false && <Card className="empty-card"><Text className="heading">登录网易云音乐</Text><Text>用手机号和短信验证码同步你的歌单、收藏和喜欢的歌曲。</Text><Button onClick={() => Taro.redirectTo({ url: '/pages/account/index' })}>前往登录</Button></Card>}
    {authenticated && kind === 'playlist' && (detail ? <View><Text className="back-link" onClick={() => setDetail(null)}>‹ 返回音乐库</Text><Text className="heading">{detail.playlist.name}</Text>{detail.tracks.map(track => <TrackRow key={track.sourceId} track={track} queue={detail.tracks} />)}</View> : <View><View className="section-heading"><Text className="heading">我的歌单</Text><Text className="link" onClick={() => setCreating(true)}>＋ 新建</Text></View>{creating && <Card className="create-box"><Input value={name} maxlength={40} placeholder="给歌单起个名字" onInput={e => setName(e.detail.value)} /><Button small onClick={() => { if (!name.trim()) return; createPlaylist(name.trim()).then(() => { setCreating(false); setName(''); load('playlist') }).catch(e => setError(e.message)) }}>创建歌单</Button></Card>}{(items as Playlist[]).map(item => <View key={item.id} className="library-row" onClick={() => open(item.id)}><Artwork url={item.coverUrl} size="large" /><View><Text className="track-name">{item.name}</Text><Text className="track-artist">{item.trackCount} 首 · {item.description || '我的音乐收藏'}</Text></View><Text>›</Text></View>)}</View>)}
    {authenticated && kind === 'liked' && (items as TrackRef[]).map(track => <TrackRow key={track.sourceId} track={track} queue={items as TrackRef[]} />)}
    {authenticated && (kind === 'album' || kind === 'artist') && items.map(item => { const entry = item as Album | Artist; return <View key={entry.id} className="library-row"><Artwork url={entry.coverUrl} size="large" /><View><Text className="track-name">{entry.name}</Text><Text className="track-artist">{'artistName' in entry ? entry.artistName : `${entry.musicCount} 首歌曲`}</Text></View></View> })}
    {authenticated && !items.length && !detail && <Notice text="这里还没有音乐，去发现喜欢的歌曲吧。" />}
  </ScrollView><MiniPlayer /></Page>
}
