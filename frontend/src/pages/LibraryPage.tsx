import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Disc3, Heart, ListMusic, Music2, Plus, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TrackListItem } from '../components/music/TrackListItem'
import { GlassPanel } from '../components/shared/GlassPanel'
import type { DemoTrack } from '../data/tracks'
import { createNeteasePlaylist, type AlbumSummary, type ArtistSummary, type LibraryType, type PlaylistSummary } from '../lib/api'
import { queries, queryKeys } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

const tabs: Array<{ value: LibraryType; label: string; icon: typeof ListMusic }> = [
  { value: 'playlist', label: '歌单', icon: ListMusic }, { value: 'liked', label: '喜欢的音乐', icon: Heart },
  { value: 'album', label: '收藏专辑', icon: Disc3 }, { value: 'artist', label: '关注歌手', icon: UserRound },
]

export function LibraryPage() {
  const [tab, setType] = useLibraryTab()
  const [searchParams, setSearchParams] = useSearchParams()
  const playlistId = searchParams.get('playlist')
  const type: LibraryType = playlistId ? 'playlist' : tab
  const setPlaylistId = (id: string | null) => setSearchParams(id ? { playlist: id } : {})
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState('')
  const account = useQuery(queries.accountStatus())
  const userId = Number(account.data?.account?.id ?? 0)
  const library = useQuery({ ...queries.library(userId, type), enabled: Boolean(account.data?.authenticated) })
  const detail = useQuery({ ...queries.playlistTracks(userId, playlistId ?? ''), enabled: Boolean(account.data?.authenticated && playlistId) })
  const client = useQueryClient()
  const player = usePlayerStore()
  const items = library.data?.items ?? []
  const label = tabs.find((tab) => tab.value === type)?.label ?? '音乐库'
  const playlists = type === 'playlist' ? items as PlaylistSummary[] : []
  const created = playlists.filter((item) => !item.subscribed)
  const subscribed = playlists.filter((item) => item.subscribed)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true); setError('')
    try {
      const result = await createNeteasePlaylist(name.trim())
      await client.invalidateQueries({ queryKey: queryKeys.library(userId, 'playlist') })
      setName(''); setCreateOpen(false); setPlaylistId(result.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建歌单失败') }
    finally { setCreating(false) }
  }

  return <div className="immersive-page library-page-v2 page-with-player">
    <div className="ambient-petals" />
    <section className="library-title"><h1>音乐库</h1><p>{account.data?.authenticated ? `${account.data.profile?.nickname ?? '我的'} · 网易云个人音乐` : '连接网易云，带回属于你的音乐。'}</p></section>
    <nav className="library-tabs" aria-label="音乐库分类">{tabs.map(({ value, label: tabLabel, icon: Icon }) => <button key={value} type="button" className={type === value ? 'active' : ''} onClick={() => { setType(value); setPlaylistId(null) }}><Icon />{tabLabel}</button>)}</nav>
    {account.isPending ? <LibraryMessage text="正在读取网易云登录状态…" /> : null}
    {!account.isPending && !account.data?.authenticated ? <LibraryMessage text="登录后即可同步你的歌单、喜欢的音乐、收藏专辑和关注歌手。"><Link to="/account">连接网易云音乐</Link></LibraryMessage> : null}
    {account.data?.authenticated && !playlistId && library.isPending ? <LibraryMessage text={`正在同步${label}…`} /> : null}
    {!playlistId && library.isError ? <LibraryMessage text={library.error.message}><button type="button" onClick={() => void library.refetch()}>重试</button></LibraryMessage> : null}
    {account.data?.authenticated && type === 'playlist' && (playlistId || (!library.isPending && !library.isError)) ? <section className="personal-library-content">
      {playlistId ? <>
        <button className="library-back" type="button" onClick={() => setPlaylistId(null)}>← 返回歌单</button>
        {detail.isPending ? <LibraryMessage text="正在读取歌单歌曲…" /> : detail.isError ? <LibraryMessage text={detail.error.message}><button type="button" onClick={() => void detail.refetch()}>重试</button></LibraryMessage> : <>
          <header><h2>{detail.data?.playlist.name} <small>{detail.data?.tracks.length ?? 0}</small></h2><button type="button" disabled={!detail.data?.tracks.length} onClick={() => player.playQueue(detail.data!.tracks, 0)}>播放全部</button></header>
          {detail.data?.tracks.length ? <div className="library-track-list">{detail.data.tracks.map((track, index) => <TrackListItem key={`${track.id}:${index}`} track={track} onPlay={() => player.playQueue(detail.data!.tracks, index)} />)}</div> : <LibraryMessage text="这个歌单还没有歌曲" />}
        </>}
      </> : <>
        <header><h2>我创建的歌单 <small>{created.length}</small></h2></header>
        <div className="library-card-grid"><button className="library-create-card" type="button" onClick={() => { setCreateOpen(true); setError('') }}><span><Plus size={34} /></span><strong>创建歌单</strong><small>收集喜欢的歌曲</small></button>{created.map((item) => <LibraryCard key={item.id} item={item} onClick={() => setPlaylistId(item.id)} />)}</div>
        <header><h2>收藏的歌单 <small>{subscribed.length}</small></h2></header>
        {subscribed.length ? <div className="library-card-grid">{subscribed.map((item) => <LibraryCard key={item.id} item={item} onClick={() => setPlaylistId(item.id)} />)}</div> : <p className="library-section-empty">还没有收藏的歌单</p>}
      </>}
    </section> : null}
    {account.data?.authenticated && type !== 'playlist' && !library.isPending && !library.isError ? items.length ? <section className="personal-library-content">
      <header><h2>{label} <small>{items.length}</small></h2><span>来自网易云音乐</span></header>
      {type === 'liked' ? <div className="library-track-list">{(items as DemoTrack[]).map((track) => <TrackListItem key={track.id} track={track} onPlay={() => player.play(track)} />)}</div> : null}
      {type === 'album' ? <div className="library-card-grid">{(items as AlbumSummary[]).map((item) => <StaticCard key={item.id} image={item.coverUrl} title={item.name} subtitle={`${item.artistName} · ${item.size} 首`} />)}</div> : null}
      {type === 'artist' ? <div className="library-card-grid artists">{(items as ArtistSummary[]).map((item) => <StaticCard key={item.id} image={item.coverUrl} title={item.name} subtitle={`${item.musicCount} 首歌曲 · ${item.albumCount} 张专辑`} />)}</div> : null}
    </section> : <LibraryMessage text={`网易云账号中暂时没有${label}`} /> : null}
    {createOpen ? <div className="library-modal-backdrop" onClick={() => setCreateOpen(false)}><form className="library-create-dialog glass-panel" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void create(event)}><h2>创建歌单</h2><label htmlFor="playlist-name">歌单名称</label><input id="playlist-name" autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="给歌单起个名字" />{error ? <p role="alert">{error}</p> : null}<div><button type="button" onClick={() => setCreateOpen(false)}>取消</button><button type="submit" disabled={creating || !name.trim()}>{creating ? '创建中…' : '创建'}</button></div></form></div> : null}
  </div>
}

function useLibraryTab(): [LibraryType, (value: LibraryType) => void] {
  const key = 'tmusic:library-tab'
  const initial = sessionStorage.getItem(key) as LibraryType | null
  const state = useState<LibraryType>(initial && ['playlist', 'liked', 'album', 'artist'].includes(initial) ? initial : 'playlist')
  return [state[0], (value) => { sessionStorage.setItem(key, value); state[1](value) }]
}

function LibraryMessage({ text, children }: { text: string; children?: ReactNode }) { return <GlassPanel className="library-message"><Music2 size={30} /><p>{text}</p>{children}</GlassPanel> }
function LibraryCard({ item, onClick }: { item: PlaylistSummary; onClick: () => void }) { return <button type="button" className="library-card library-card-button" onClick={onClick}><div>{item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" /> : <span>♫</span>}</div><strong title={item.name}>{item.name}</strong><small>{item.trackCount} 首</small>{item.description ? <p>{item.description}</p> : null}</button> }
function StaticCard({ image, title, subtitle }: { image: string | null; title: string; subtitle: string }) { return <article className="library-card"><div>{image ? <img src={image} alt="" loading="lazy" /> : <span>♫</span>}</div><strong title={title}>{title}</strong><small>{subtitle}</small></article> }
