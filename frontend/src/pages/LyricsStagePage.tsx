import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getAudioEngine } from '../lib/audioEngine'
import { LyricStageRenderer, type StageLyric } from '../lib/lyricStageRenderer'
import { parseLyricLines } from '../lib/lyrics'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

export function LyricsStagePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<LyricStageRenderer | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const currentId = usePlayerStore((state) => state.currentId)
  const queue = usePlayerStore((state) => state.queue)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const progressMs = usePlayerStore((state) => state.progressMs)
  const closeQueue = usePlayerStore((state) => state.closeQueue)
  const track = queue.find((item) => item.id === currentId) ?? queue[0]
  const sourceId = track?.sourceId ?? ''
  const hasSource = /^\d+$/.test(sourceId)
  const lyrics = useQuery({ ...queries.lyrics(sourceId), enabled: hasSource })
  const [fontReady, setFontReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [contextRevision, setContextRevision] = useState(0)
  const [renderError, setRenderError] = useState(false)

  const lines = useMemo<StageLyric[]>(() => {
    const parsed = parseLyricLines(lyrics.data?.original ?? '')
    const timed = parsed.filter((line): line is typeof line & { timeMs: number } => line.timeMs !== null)
    if (timed.length) return timed.map(({ timeMs, text }) => ({ timeMs, text }))
    const plain = parsed.filter((line) => line.timeMs === null)
    const interval = Math.max(2500, (track?.durationMs ?? 0) / Math.max(plain.length, 1))
    return plain.map(({ text }, index) => ({ timeMs: index * interval, text }))
  }, [lyrics.data?.original, track?.durationMs])

  useEffect(() => {
    let active = true
    void document.fonts.load('120px "Smiley Sans"').catch(() => []).then(() => { if (active) setFontReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => { closeQueue() }, [closeQueue])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const lost = (event: Event) => { event.preventDefault(); setContextLost(true) }
    const restored = () => { setContextLost(false); setContextRevision((value) => value + 1) }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontReady || contextLost) return
    let renderer: LyricStageRenderer
    try {
      renderer = new LyricStageRenderer(canvas, lines)
      setRenderError(false)
    } catch {
      setRenderError(true)
      return
    }
    rendererRef.current = renderer
    const resize = () => {
      renderer.resize()
      const state = usePlayerStore.getState()
      renderer.render(state.progressMs, track?.durationMs ?? 0, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      renderer.dispose()
      if (rendererRef.current === renderer) rendererRef.current = null
    }
  }, [fontReady, contextLost, contextRevision, lines, track?.durationMs])

  useEffect(() => {
    if (!fontReady || contextLost || !rendererRef.current) return
    let frame = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const draw = () => {
      const state = usePlayerStore.getState()
      const audio = getAudioEngine()
      const audioMs = audio.currentTime * 1000
      const timeMs = state.isPlaying && !audio.paused && audio.readyState > 0 && Math.abs(audioMs - state.progressMs) < 1500 ? audioMs : state.progressMs
      rendererRef.current?.render(timeMs, track?.durationMs ?? 0, reduced.matches)
    }
    const loop = () => {
      draw()
      if (usePlayerStore.getState().isPlaying && document.visibilityState === 'visible') frame = requestAnimationFrame(loop)
    }
    const onVisibility = () => {
      cancelAnimationFrame(frame)
      if (document.visibilityState === 'visible') {
        if (usePlayerStore.getState().isPlaying) frame = requestAnimationFrame(loop)
        else draw()
      }
    }
    draw()
    if (isPlaying) frame = requestAnimationFrame(loop)
    document.addEventListener('visibilitychange', onVisibility)
    reduced.addEventListener('change', draw)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', draw)
    }
  }, [fontReady, contextLost, contextRevision, lines, isPlaying, track?.durationMs])

  useEffect(() => {
    if (!isPlaying) rendererRef.current?.render(progressMs, track?.durationMs ?? 0, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [progressMs, isPlaying, track?.durationMs])

  const message = !track ? '播放歌曲后，歌词会出现在这里' : !hasSource ? '当前歌曲暂无同步歌词' : lyrics.isPending ? '正在加载歌词' : lyrics.isError ? '歌词加载失败' : !lines.length ? '这首歌暂无歌词' : renderError || contextLost ? '歌词画面暂时不可用' : ''
  const spokenLine = lines.reduce((active, line) => line.timeMs <= progressMs ? line.text : active, '')

  const goBack = () => {
    const from = (location.state as { from?: unknown } | null)?.from
    navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/lyrics-stage' ? from : '/discover', { replace: true })
  }

  return <section className="lyric-stage" aria-label="沉浸歌词">
    <canvas ref={canvasRef} className="lyric-stage-canvas" aria-hidden="true" />
    {message ? <div className="lyric-stage-message" role="status">{message}</div> : null}
    {!message ? <span className="lyric-stage-screenreader" aria-live="polite">{spokenLine}</span> : null}
    <button className="lyric-stage-back" type="button" onClick={goBack} aria-label="返回上一页" title="返回上一页"><ArrowLeft size={23} strokeWidth={1.7} /></button>
  </section>
}
