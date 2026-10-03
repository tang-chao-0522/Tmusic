import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Clock3, Disc3, ListMusic, Music2, Search, UserRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type UIEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrackListItem } from '../components/music/TrackListItem'
import { GlassPanel } from '../components/shared/GlassPanel'
import { Input } from '../components/ui/input'
import { type AlbumSummary, type ArtistSummary, type PlaylistSummary, type SearchType } from '../lib/api'
import { queries } from '../lib/queries'
import type { DemoTrack } from '../data/tracks'
import { usePlayerStore } from '../stores/playerStore'

const historyKey = 'tmusic:recent-searches'
const types: Array<{ value: SearchType; label: string; icon: typeof Music2 }> = [
  { value: 'song', label: '歌曲', icon: Music2 }, { value: 'playlist', label: '歌单', icon: ListMusic },
  { value: 'artist', label: '歌手', icon: UserRound }, { value: 'album', label: '专辑', icon: Disc3 },
]
function readHistory(): string[] { try { return JSON.parse(localStorage.getItem(historyKey) ?? '[]') as string[] } catch { return [] } }

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const initialKeyword = searchParams.get('q')?.trim() ?? ''
  const [query, setQuery] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [type, setType] = useState<SearchType>('song')
  const [history, setHistory] = useState(readHistory)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const play = usePlayerStore((state) => state.play)

  useEffect(() => { const timer = window.setTimeout(() => setKeyword(query.trim()), 350); return () => window.clearTimeout(timer) }, [query])
  const search = useInfiniteQuery({ ...queries.search(keyword, type), enabled: keyword.length > 0 })
  const trending = useQuery({ ...queries.catalogHome(), enabled: keyword.length === 0 })
  const items = keyword ? search.data?.pages.flatMap((page) => page.items) ?? [] : type === 'song' ? trending.data?.recommendations ?? [] : []
  const tracks = type === 'song' ? items as DemoTrack[] : []
  const isLoading = keyword ? search.isPending : trending.isPending
  const error = keyword ? search.error : trending.error
  const rowVirtualizer = useVirtualizer({ count: tracks.length + (keyword && tracks.length ? 1 : 0), getScrollElement: () => scrollerRef.current, estimateSize: () => 60, overscan: 6 })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => { scrollerRef.current?.scrollTo({ top: 0 }) }, [keyword, type])
  useEffect(() => { const last = virtualRows.at(-1); if (type === 'song' && keyword && last && last.index >= tracks.length - 5 && search.hasNextPage && !search.isFetching) void search.fetchNextPage() }, [type, keyword, virtualRows, tracks.length, search.hasNextPage, search.isFetching, search.fetchNextPage])

  function commit(value: string) {
    const next = value.trim(); if (!next) return
    setQuery(next); setKeyword(next)
    const nextHistory = [next, ...history.filter((item) => item !== next)].slice(0, 6)
    setHistory(nextHistory); localStorage.setItem(historyKey, JSON.stringify(nextHistory))
  }
  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    if (type === 'song' || !keyword || !search.hasNextPage || search.isFetchingNextPage) return
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 180) void search.fetchNextPage()
  }
  const selectedLabel = types.find((item) => item.value === type)?.label ?? '结果'

  return <div className="immersive-page search-page-v2 page-with-player">
    <div className="ambient-petals" />
    <section className="search-intro">
      <p>用声音，<br />再次遇见那时的天空。</p><h1>找到你喜欢的声音。</h1>
      <form className="giant-search glass-panel" onSubmit={(event) => { event.preventDefault(); commit(query) }}>
        <Search size={29} /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索网易云${selectedLabel}…`} aria-label={`搜索网易云${selectedLabel}`} />
        {query ? <button type="button" onClick={() => { setQuery(''); setKeyword('') }} aria-label="清空搜索"><X /></button> : null}<button type="submit" aria-label="搜索">→</button>
      </form>
      <div className="search-chips" aria-label="搜索分类">{types.map(({ value, label, icon: Icon }) => <button type="button" key={value} className={type === value ? 'active' : ''} onClick={() => setType(value)}><Icon size={15} />{label}</button>)}</div>
    </section>
    <section className="search-board">
      <GlassPanel as="aside" className="recent-searches">
        <header><h2>最近搜索</h2><button type="button" onClick={() => { setHistory([]); localStorage.removeItem(historyKey) }}>全部清除</button></header>
        {history.length ? history.map((item) => <div key={item} className="history-row"><Clock3 size={18} /><button type="button" onClick={() => commit(item)}>{item}</button><button type="button" aria-label={`删除 ${item}`} onClick={() => { const next = history.filter((entry) => entry !== item); setHistory(next); localStorage.setItem(historyKey, JSON.stringify(next)) }}><X size={15} /></button></div>) : <p className="search-hint">搜索过的内容会出现在这里</p>}
      </GlassPanel>
      <GlassPanel className="result-panel">
        <div className="result-tabs"><strong>{keyword ? `“${keyword}” 的${selectedLabel}` : type === 'song' ? '网易云新歌' : `输入关键词搜索${selectedLabel}`}</strong><span>{isLoading ? '搜索中…' : error && !items.length ? '连接失败' : keyword ? `已加载 ${items.length} / ${search.data?.pages[0]?.total ?? 0}` : `${items.length} 首歌曲`}</span></div>
        {error && !items.length ? <div className="search-feedback" role="alert"><p>{error.message}</p><button type="button" onClick={() => keyword ? search.refetch() : trending.refetch()}>重试</button></div> : null}
        {!error && !isLoading && items.length === 0 ? <div className="search-feedback">{keyword ? `没有找到相关${selectedLabel}` : type === 'song' ? '网易云暂未返回歌曲' : `输入关键词后搜索${selectedLabel}`}</div> : null}
        <div className="result-scroller" ref={scrollerRef} aria-label={`${selectedLabel}搜索结果`} onScroll={loadMoreOnScroll}>
          {type === 'song' ? <div className="result-list" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>{virtualRows.map((row) => { const track = tracks[row.index]; return track ? <TrackListItem key={`${track.id}:${row.index}`} track={track} style={{ position: 'absolute', top: 0, transform: `translateY(${row.start}px)` }} onPlay={() => { commit(query || track.name); play(track) }} /> : <div className="result-load-state" key="load-state" style={{ transform: `translateY(${row.start}px)` }}>{search.isFetchNextPageError ? <button type="button" onClick={() => void search.fetchNextPage()}>加载失败，点击重试</button> : search.hasNextPage ? '正在加载更多…' : '已经到底了'}</div> })}</div>
            : <div className="catalog-result-grid">{items.map((item) => <CatalogResultCard key={(item as PlaylistSummary | AlbumSummary | ArtistSummary).id} type={type} item={item as PlaylistSummary | AlbumSummary | ArtistSummary} />)}{search.isFetchingNextPage ? <div className="catalog-scroll-status"><i /><i /><i /><span>正在加载更多{selectedLabel}</span></div> : null}{search.isFetchNextPageError ? <div className="catalog-scroll-status error">加载遇到问题，继续滚动即可重试</div> : null}</div>}
        </div>
      </GlassPanel>
    </section>
  </div>
}

function CatalogResultCard({ type, item }: { type: Exclude<SearchType, 'song'>; item: PlaylistSummary | AlbumSummary | ArtistSummary }) {
  const isPlaylist = type === 'playlist', isAlbum = type === 'album'
  const subtitle = isPlaylist ? `${(item as PlaylistSummary).trackCount} 首 · ${(item as PlaylistSummary).creatorName ?? '网易云音乐'}` : isAlbum ? (item as AlbumSummary).artistName : `${(item as ArtistSummary).musicCount} 首歌曲 · ${(item as ArtistSummary).albumCount} 张专辑`
  return <article className={`catalog-result-card ${type === 'artist' ? 'round' : ''}`}><div>{item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" /> : <span>{type === 'artist' ? '歌' : '♫'}</span>}</div><section><strong>{item.name}</strong><small>{subtitle}</small>{isPlaylist && (item as PlaylistSummary).description ? <p>{(item as PlaylistSummary).description}</p> : null}</section></article>
}
