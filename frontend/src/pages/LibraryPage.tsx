import { useQuery } from '@tanstack/react-query'
import { Disc3, Heart, ListMusic, Music2, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackListItem } from '../components/music/TrackListItem'
import { GlassPanel } from '../components/shared/GlassPanel'
import type { DemoTrack } from '../data/tracks'
import { type AlbumSummary, type ArtistSummary, type LibraryType, type PlaylistSummary } from '../lib/api'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

const tabs: Array<{ value: LibraryType; label: string; icon: typeof ListMusic }> = [
  { value: 'playlist', label: '歌单', icon: ListMusic }, { value: 'liked', label: '喜欢的音乐', icon: Heart },
  { value: 'album', label: '收藏专辑', icon: Disc3 }, { value: 'artist', label: '关注歌手', icon: UserRound },
]

export function LibraryPage() {
  const [type, setType] = useLibraryTab()
  const account = useQuery(queries.accountStatus())
  const library = useQuery({ ...queries.library(Number(account.data?.account?.id ?? 0), type), enabled: Boolean(account.data?.authenticated) })
  const play = usePlayerStore((state) => state.play)
  const items = library.data?.items ?? []
  const label = tabs.find((tab) => tab.value === type)?.label ?? '音乐库'

  return <div className="immersive-page library-page-v2 page-with-player">
    <PageTopbar /><div className="ambient-petals" />
    <section className="library-title"><h1>音乐库</h1><p>{account.data?.authenticated ? `${account.data.profile?.nickname ?? '我的'} · 网易云个人音乐` : '连接网易云，带回属于你的音乐。'}</p></section>
    <nav className="library-tabs" aria-label="音乐库分类">{tabs.map(({ value, label: tabLabel, icon: Icon }) => <button key={value} type="button" className={type === value ? 'active' : ''} onClick={() => setType(value)}><Icon />{tabLabel}</button>)}</nav>
    {account.isPending ? <LibraryMessage text="正在读取网易云登录状态…" /> : null}
    {!account.isPending && !account.data?.authenticated ? <LibraryMessage text="登录后即可同步你的歌单、喜欢的音乐、收藏专辑和关注歌手。"><Link to="/account">连接网易云音乐</Link></LibraryMessage> : null}
    {account.data?.authenticated && library.isPending ? <LibraryMessage text={`正在同步${label}…`} /> : null}
    {library.isError ? <LibraryMessage text={library.error.message}><button type="button" onClick={() => void library.refetch()}>重试</button></LibraryMessage> : null}
    {!library.isPending && !library.isError && account.data?.authenticated && items.length === 0 ? <LibraryMessage text={`网易云账号中暂时没有${label}`} /> : null}
    {items.length ? <section className="personal-library-content">
      <header><h2>{label} <small>{items.length}</small></h2><span>来自网易云音乐</span></header>
      {type === 'liked' ? <div className="library-track-list">{(items as DemoTrack[]).map((track) => <TrackListItem key={track.id} track={track} onPlay={() => play(track)} />)}</div> : null}
      {type === 'playlist' ? <div className="library-card-grid">{(items as PlaylistSummary[]).map((item) => <LibraryCard key={item.id} image={item.coverUrl} title={item.name} subtitle={`${item.trackCount} 首 · ${item.subscribed ? '收藏歌单' : '我创建的'}`} description={item.description} />)}</div> : null}
      {type === 'album' ? <div className="library-card-grid">{(items as AlbumSummary[]).map((item) => <LibraryCard key={item.id} image={item.coverUrl} title={item.name} subtitle={`${item.artistName}${item.size ? ` · ${item.size} 首` : ''}`} />)}</div> : null}
      {type === 'artist' ? <div className="library-card-grid artists">{(items as ArtistSummary[]).map((item) => <LibraryCard key={item.id} image={item.coverUrl} title={item.name} subtitle={`${item.musicCount} 首歌曲 · ${item.albumCount} 张专辑`} />)}</div> : null}
    </section> : null}
  </div>
}

function useLibraryTab(): [LibraryType, (value: LibraryType) => void] {
  const key = 'tmusic:library-tab'
  const initial = sessionStorage.getItem(key) as LibraryType | null
  const state = useState<LibraryType>(initial && ['playlist', 'liked', 'album', 'artist'].includes(initial) ? initial : 'playlist')
  return [state[0], (value) => { sessionStorage.setItem(key, value); state[1](value) }]
}

function LibraryMessage({ text, children }: { text: string; children?: ReactNode }) {
  return <GlassPanel className="library-message"><Music2 size={30} /><p>{text}</p>{children}</GlassPanel>
}

function LibraryCard({ image, title, subtitle, description }: { image: string | null; title: string; subtitle: string; description?: string }) {
  return <article className="library-card"><div>{image ? <img src={image} alt="" loading="lazy" /> : <span>♫</span>}</div><strong title={title}>{title}</strong><small>{subtitle}</small>{description ? <p>{description}</p> : null}</article>
}
