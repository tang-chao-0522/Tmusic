import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { queries } from '../../lib/queries'

type LyricLine = { timeMs: number | null; text: string; translation?: string }
const timestamp = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g

function parseLines(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of source.split(/\r?\n/)) {
    const marks = [...raw.matchAll(timestamp)]
    const text = raw.replace(timestamp, '').trim()
    if (!text || /^\[(?:ar|al|ti|by|offset|length):/i.test(raw)) continue
    if (!marks.length) { if (!raw.startsWith('[')) lines.push({ timeMs: null, text }); continue }
    for (const mark of marks) {
      const milliseconds = Number((mark[3] ?? '').padEnd(3, '0'))
      lines.push({ timeMs: (Number(mark[1]) * 60 + Number(mark[2])) * 1000 + milliseconds, text })
    }
  }
  return lines.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))
}

export function SyncedLyrics({ sourceId, progressMs, onSeek }: { sourceId: string; progressMs: number; onSeek: (timeMs: number) => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const lyrics = useQuery({ ...queries.lyrics(sourceId), enabled: /^\d+$/.test(sourceId) })
  const lines = useMemo(() => {
    const original = parseLines(lyrics.data?.original ?? '')
    const translated = parseLines(lyrics.data?.translation ?? '')
    const translationByTime = new Map(translated.filter((line) => line.timeMs !== null).map((line) => [line.timeMs, line.text]))
    return original.map((line) => ({ ...line, translation: line.timeMs === null ? undefined : translationByTime.get(line.timeMs) }))
  }, [lyrics.data])
  const activeIndex = lines.reduce((active, line, index) => line.timeMs !== null && line.timeMs <= progressMs ? index : active, -1)

  useEffect(() => {
    const scroller = scrollerRef.current
    const active = scroller?.querySelector<HTMLElement>(`[data-lyric-index="${activeIndex}"]`)
    if (scroller && active) scroller.scrollTo({ top: active.offsetTop - scroller.clientHeight / 2 + active.clientHeight / 2, behavior: 'smooth' })
  }, [activeIndex, sourceId])

  if (!/^\d+$/.test(sourceId)) return <div className="lyrics-empty">当前歌曲暂无真实歌词</div>
  if (lyrics.isPending) return <div className="lyrics-empty">正在获取歌词…</div>
  if (lyrics.isError) return <div className="lyrics-empty">歌词加载失败 <button type="button" onClick={() => void lyrics.refetch()}>重试</button></div>
  if (!lines.length) return <div className="lyrics-empty">这首歌暂无歌词</div>

  return <div className="lyrics-scroll" ref={scrollerRef} aria-label="同步歌词">
    {lines.map((line, index) => <button
      type="button" key={`${line.timeMs}-${index}`} data-lyric-index={index}
      className={`lyric-line ${index === activeIndex ? 'active' : ''}`}
      onClick={() => { if (line.timeMs !== null) onSeek(line.timeMs) }}
      disabled={line.timeMs === null}
    ><span>{line.text}</span>{line.translation ? <small>{line.translation}</small> : null}</button>)}
  </div>
}
