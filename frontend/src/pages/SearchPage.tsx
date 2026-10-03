import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Clock3, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { formatDuration } from '../data/tracks'
import { getCatalogHome, searchCatalog } from '../lib/api'
import { usePlayerStore } from '../stores/playerStore'

const historyKey = 'tmusic:recent-searches'
function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(historyKey) ?? '[]') as string[] } catch { return [] }
}

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const initialKeyword = searchParams.get('q')?.trim() ?? ''
  const [query, setQuery] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [history, setHistory] = useState(readHistory)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const play = usePlayerStore((state) => state.play)

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  const search = useInfiniteQuery({
    queryKey: ['catalog-search', keyword],
    queryFn: ({ pageParam }) => searchCatalog(keyword, pageParam, 30),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset ?? undefined : undefined,
    enabled: keyword.length > 0,
  })
  const trending = useQuery({ queryKey: ['catalog-home'], queryFn: getCatalogHome, enabled: keyword.length === 0 })
  const tracks = keyword ? search.data?.pages.flatMap((page) => page.tracks) ?? [] : trending.data?.recommendations ?? []
  const isLoading = keyword ? search.isPending : trending.isPending
  const error = keyword ? search.error : trending.error
  const rowVirtualizer = useVirtualizer({
    count: tracks.length + (keyword && tracks.length ? 1 : 0),
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 60,
    overscan: 6,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => { scrollerRef.current?.scrollTo({ top: 0 }) }, [keyword])
  useEffect(() => {
    const lastRow = virtualRows.at(-1)
    if (keyword && lastRow && lastRow.index >= tracks.length - 5 && search.hasNextPage && !search.isFetching) {
      void search.fetchNextPage()
    }
  }, [keyword, virtualRows, tracks.length, search.hasNextPage, search.isFetching, search.fetchNextPage])

  function commit(value: string) {
    const next = value.trim()
    if (!next) return
    setQuery(next)
    setKeyword(next)
    const items = [next, ...history.filter((item) => item !== next)].slice(0, 6)
    setHistory(items)
    localStorage.setItem(historyKey, JSON.stringify(items))
  }

  return <div className="immersive-page search-page-v2 page-with-player">
    <div className="ambient-petals" />
    <section className="search-intro">
      <p>用声音，<br />再次遇见那时的天空。</p><h1>找到你喜欢的声音。</h1>
      <form className="giant-search glass-panel" onSubmit={(event) => { event.preventDefault(); commit(query) }}>
        <Search size={29} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索网易云歌曲或歌手…" aria-label="搜索网易云歌曲或歌手" />
        {query ? <button type="button" onClick={() => { setQuery(''); setKeyword('') }} aria-label="清空搜索"><X /></button> : null}
        <button type="submit" aria-label="搜索">→</button>
      </form>
      <div className="search-chips"><span className="active">网易云歌曲</span><span>输入歌名或歌手，自动搜索</span></div>
    </section>
    <section className="search-board">
      <aside className="recent-searches glass-panel">
        <header><h2>最近搜索</h2><button type="button" onClick={() => { setHistory([]); localStorage.removeItem(historyKey) }}>全部清除</button></header>
        {history.length ? history.map((item) => <div key={item} className="history-row"><Clock3 size={18} /><button type="button" onClick={() => commit(item)}>{item}</button><button type="button" aria-label={`删除 ${item}`} onClick={() => { const items = history.filter((entry) => entry !== item); setHistory(items); localStorage.setItem(historyKey, JSON.stringify(items)) }}><X size={15} /></button></div>) : <p className="search-hint">搜索过的歌曲会出现在这里</p>}
      </aside>
      <div className="result-panel glass-panel">
        <div className="result-tabs"><strong>{keyword ? `“${keyword}” 的歌曲` : '网易云新歌'}</strong><span>{isLoading ? '搜索中…' : error && !tracks.length ? '连接失败' : keyword ? `已加载 ${tracks.length} / ${search.data?.pages[0]?.total ?? 0} 首` : `${tracks.length} 首歌曲`}</span></div>
        {error && !tracks.length ? <div className="search-feedback" role="alert"><p>{error.message}</p><button type="button" onClick={() => keyword ? search.refetch() : trending.refetch()}>重试</button></div> : null}
        {!error && !isLoading && tracks.length === 0 ? <div className="search-feedback">{keyword ? '没有找到相关歌曲，试试其他关键词' : '网易云暂未返回歌曲'}</div> : null}
        <div className="result-scroller" ref={scrollerRef} aria-label="搜索结果，滚动加载更多">
          <div className="result-list" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {virtualRows.map((row) => {
              const track = tracks[row.index]
              if (!track) return <div className="result-load-state" key="load-state" style={{ transform: `translateY(${row.start}px)` }}>
                {search.isFetchNextPageError ? <button type="button" onClick={() => void search.fetchNextPage()}>加载失败，点击重试</button> : search.hasNextPage ? '正在加载更多歌曲…' : '已经到底了'}
              </div>
              return <button type="button" className="result-row" key={`${track.id}:${row.index}`} style={{ position: 'absolute', top: 0, transform: `translateY(${row.start}px)` }} onClick={() => { commit(query || track.name); play(track) }}>
                <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} /><span><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join(' / ')}</small></span><em>{track.album?.name}</em><time>{formatDuration(track.durationMs)}</time><span className="result-play">▶</span>
              </button>
            })}
          </div>
        </div>
      </div>
    </section>
  </div>
}
