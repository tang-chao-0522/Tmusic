import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { StageLine } from '../components/player/LyricsStageScene'
import { usePlaybackSeek } from '../components/player/usePlaybackSeek'
import { getStageDemoLyrics } from '../data/stageDemoLyrics'
import { formatDuration } from '../data/tracks'
import { parseLyricLines } from '../lib/lyrics'
import { queries } from '../lib/queries'
import { usePlayerStore } from '../stores/playerStore'

const LyricsStageScene = lazy(() => import('../components/player/LyricsStageScene').then((module) => ({ default: module.LyricsStageScene })))

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export function LyricsStagePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = usePlayerStore()
  const compact = useMedia('(max-width: 767px)')
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const [sceneUnavailable, setSceneUnavailable] = useState(false)
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  const sourceId = track?.sourceId ?? ''
  const hasSource = /^\d+$/.test(sourceId)
  const lyrics = useQuery({ ...queries.lyrics(sourceId), enabled: hasSource })
  const progress = usePlaybackSeek(state.progressMs, state.seek, state.roomMode, track?.id)

  const { lines, plainLines } = useMemo(() => {
    const original = parseLyricLines(lyrics.data?.original ?? '')
    const translated = parseLyricLines(lyrics.data?.translation ?? '')
    const translationByTime = new Map(translated.filter((line) => line.timeMs !== null).map((line) => [line.timeMs, line.text]))
    const timed = original.filter((line): line is typeof line & { timeMs: number } => line.timeMs !== null).map(({ timeMs, text }): StageLine => ({ timeMs, text, translation: translationByTime.get(timeMs) }))
    return {
      lines: sourceId.startsWith('demo-') ? getStageDemoLyrics(sourceId) : timed,
      plainLines: original.filter((line) => line.timeMs === null).map((line) => line.text),
    }
  }, [lyrics.data, sourceId])

  let low = 0
  let high = lines.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (lines[middle]!.timeMs <= state.progressMs) low = middle + 1
    else high = middle
  }
  const activeIndex = Math.max(0, low - 1)
  const active = lines[activeIndex]
  const lyricsMessage = !track ? '选择一首歌曲，开启沉浸播放' : !hasSource && !lines.length ? '当前歌曲暂无同步歌词' : hasSource && lyrics.isPending ? '正在加载歌词…' : hasSource && lyrics.isError ? '歌词加载失败' : !lines.length && !plainLines.length ? '这首歌暂无歌词' : ''

  useEffect(() => { state.closeQueue() }, [state.closeQueue])

  const goBack = () => {
    const from = (location.state as { from?: unknown } | null)?.from
    navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/lyrics-stage' ? from : '/discover', { replace: true })
  }

  return <section className={`lyric-stage ${sceneUnavailable ? 'is-fallback' : ''}`} aria-label="沉浸式 3D 歌词播放页">
    <div className="lyric-stage-landscape" aria-hidden="true" />
    <div className="lyric-stage-shade" aria-hidden="true" />
    <Suspense fallback={<div className="lyric-stage-scene-fallback" aria-hidden="true" />}><LyricsStageScene key={track?.id ?? 'empty'} lines={lines} activeIndex={activeIndex} coverUrl={track?.coverUrl ?? null} isPlaying={state.isPlaying} compact={compact} reducedMotion={reducedMotion} onSeek={state.roomMode ? () => {} : state.seek} onUnavailable={() => setSceneUnavailable(true)} /></Suspense>

    <header className="lyric-stage-header">
      <button className="lyric-stage-back" type="button" onClick={goBack} aria-label="返回上一页"><ArrowLeft size={21} /></button>
      <div className="lyric-stage-brand"><span className="lyric-stage-brand-mark">✦</span><span>TMUSIC <small>/ IMMERSIVE PLAYER</small></span></div>
      <span className="lyric-stage-header-hint">拖动场景 · 改变视角</span>
    </header>

    <div className="lyric-stage-section-label lyric-stage-disc-label">NOW PLAYING <span>3D SOUND STAGE</span></div>
    <div className="lyric-stage-section-label lyric-stage-lyrics-label">LYRICS <span>·</span> {sourceId.startsWith('demo-') ? 'DEMO' : 'LIVE'}</div>

    <div className="lyric-stage-lyric-panel">
      {lyricsMessage ? <div className="lyric-stage-status" role="status">{lyricsMessage}{lyrics.isError ? <button type="button" onClick={() => void lyrics.refetch()}>重试</button> : null}</div> : null}
      {!lyricsMessage && !lines.length && plainLines.length ? <div className="lyric-stage-plain">{plainLines.slice(0, 8).map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div> : null}
      {!lyricsMessage && lines.length ? <div key={`${sourceId}-${activeIndex}`} className="lyric-stage-mobile-lines" aria-label="同步歌词">{lines.slice(Math.max(0, activeIndex - 2), activeIndex + 4).map((line) => <button key={`${line.timeMs}-${line.text}`} type="button" className={line.timeMs === active?.timeMs ? 'active' : ''} onClick={() => state.seek(line.timeMs)} disabled={state.roomMode}>{line.text}{line.translation ? <small>{line.translation}</small> : null}</button>)}</div> : null}
      <span className="lyric-stage-screenreader" aria-live="polite">{active?.text ?? ''}</span>
    </div>

    {track ? <div className="lyric-stage-bottom">
      <div className="lyric-stage-song-row">
        <div className="lyric-stage-song-meta"><span className="lyric-stage-song-eyebrow">CURRENT TRACK <i /></span><h1>{track.name}</h1><p>{track.artists.map((artist) => artist.name).join(' / ')}</p></div>
      </div>
      <div className="lyric-stage-progress">
        <input type="range" min={0} max={Math.max(1, track.durationMs)} value={Math.min(progress.value, track.durationMs)} onChange={progress.onChange} onPointerUp={progress.onPointerUp} onKeyUp={progress.onKeyUp} onBlur={progress.onBlur} disabled={state.roomMode} style={{ '--stage-progress': `${track.durationMs ? progress.value / track.durationMs * 100 : 0}%` } as React.CSSProperties} aria-label="播放进度" />
        <div><time>{formatDuration(progress.value)}</time><time>{formatDuration(track.durationMs)}</time></div>
      </div>
      <div className="lyric-stage-controls">
        <div className="lyric-stage-controls-side"><button type="button" className={state.shuffle ? 'selected' : ''} onClick={state.toggleShuffle} disabled={state.roomMode} aria-label={state.shuffle ? '关闭随机播放' : '开启随机播放'}><Shuffle size={19} /></button></div>
        <div className="lyric-stage-transport"><button type="button" onClick={state.previous} disabled={state.roomMode} aria-label="上一首"><SkipBack size={25} fill="currentColor" /></button><button className="lyric-stage-play" type="button" onClick={state.toggle} disabled={state.roomMode} aria-label={state.isPlaying ? '暂停' : '播放'}>{state.isPlaying ? <Pause size={29} fill="currentColor" /> : <Play size={29} fill="currentColor" />}</button><button type="button" onClick={state.next} disabled={state.roomMode} aria-label="下一首"><SkipForward size={25} fill="currentColor" /></button></div>
        <div className="lyric-stage-controls-side end"><button type="button" className={state.repeatMode !== 'off' ? 'selected' : ''} onClick={state.cycleRepeat} disabled={state.roomMode} aria-label={`循环模式：${state.repeatMode === 'one' ? '单曲' : state.repeatMode === 'all' ? '列表' : '关闭'}`}><Repeat2 size={19} />{state.repeatMode === 'one' ? <sup>1</sup> : null}</button><Volume2 size={19} /><input type="range" min={0} max={1} step={.01} value={state.volume} onChange={(event) => state.setVolume(Number(event.target.value))} aria-label="音量" /></div>
      </div>
    </div> : null}
  </section>
}
