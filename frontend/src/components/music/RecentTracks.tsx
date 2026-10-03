import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Music2 } from 'lucide-react'
import { useEffect, useMemo, useRef, type UIEvent } from 'react'
import { toUiTrack } from '../../lib/api'
import { queries } from '../../lib/queries'
import { usePlayerStore } from '../../stores/playerStore'

export function RecentTracks({ userId }: { userId: number }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const play = usePlayerStore((state) => state.play)
  const recent = useInfiniteQuery(queries.recent(userId))
  const items = useMemo(() => recent.data?.pages.flatMap((page) => page.items) ?? [], [recent.data])
  const rowVirtualizer = useVirtualizer({
    count: items.length + (recent.hasNextPage ? 1 : 0),
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 52,
    overscan: 5,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const last = virtualRows.at(-1)
    if (last && last.index >= items.length - 5 && recent.hasNextPage && !recent.isFetching && !recent.isFetchNextPageError) void recent.fetchNextPage()
  }, [virtualRows, items.length, recent.hasNextPage, recent.isFetching, recent.isFetchNextPageError, recent.fetchNextPage])

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget
    if (recent.hasNextPage && !recent.isFetching && !recent.isFetchNextPageError && element.scrollHeight - element.scrollTop - element.clientHeight < 180) void recent.fetchNextPage()
  }

  if (recent.isPending) return <p className="account-empty">正在加载最近听过的歌曲…</p>
  if (recent.isError && !items.length) return <p className="account-empty">最近播放记录暂时不可用 <button type="button" onClick={() => void recent.refetch()}>重试</button></p>
  if (!items.length) return <p className="account-empty">还没有最近播放记录</p>

  return <div className="account-recent-list" ref={scrollerRef} onScroll={onScroll} aria-label="最近听过的歌曲">
    <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
      {virtualRows.map((row) => {
        const item = items[row.index]
        if (!item) return <div className="account-recent-load" key="load-more" style={{ position: 'absolute', top: row.start, height: row.size }}>
          {recent.isFetchNextPageError ? <button type="button" onClick={() => void recent.fetchNextPage()}>加载失败，点击重试</button> : '正在加载更多…'}
        </div>
        const { track, playedAt } = item
        return <div className="account-recent-row" key={`${track.sourceId}-${row.index}`} style={{ position: 'absolute', top: row.start, height: row.size, width: '100%' }} role="button" tabIndex={0} aria-label={`播放 ${track.name}`} onClick={() => play(toUiTrack(track, row.index))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); play(toUiTrack(track, row.index)) } }}>
          <div className="account-recent-art">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={20} />}</div>
          <div className="account-recent-copy"><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join('、') || '未知歌手'}</small></div>
          <time>{playedAt ? new Date(playedAt).toLocaleDateString('zh-CN') : ''}</time>
        </div>
      })}
    </div>
  </div>
}
