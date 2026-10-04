import { ListMusic, MoreHorizontal, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Sparkles, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDuration } from '../../data/tracks'
import { usePlayerStore } from '../../stores/playerStore'
import { TrackArtwork } from './TrackArtwork'
import { appQueryClient } from '../../lib/queryClient'
import { getCachedPlaybackGrant } from '../../lib/queries'
import { emitRoomTrackEnded } from '../../lib/roomPlaybackEvents'
import { getAudioEngine } from '../../lib/audioEngine'
import { usePlaybackSeek } from './usePlaybackSeek'
import { TrackActions } from '../music/TrackActions'

export function PlayerDock() {
  const state = usePlayerStore()
  const navigate = useNavigate()
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playbackError, setPlaybackError] = useState('')
  const cardRef = useRef<HTMLElement | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(() => {
    try { const saved = JSON.parse(localStorage.getItem('tmusic:player-card-position') ?? 'null'); return typeof saved?.left === 'number' && typeof saved?.top === 'number' ? saved : null } catch { return null }
  })
  const [optionsOpen, setOptionsOpen] = useState(false)
  const progressControl = usePlaybackSeek(state.progressMs, state.seek, state.roomMode, track?.id)

  useEffect(() => {
    const audio = getAudioEngine()
    audio.preload = 'none'
    audioRef.current = audio
    audio.ontimeupdate = () => usePlayerStore.getState().updateProgress(Math.floor(audio.currentTime * 1000))
    audio.onended = () => { if (usePlayerStore.getState().roomMode) emitRoomTrackEnded(); else usePlayerStore.getState().next() }
    return () => { audio.pause(); audio.src = ''; audioRef.current = null }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    audio.volume = state.volume
  }, [state.volume, track])

  useEffect(() => {
    const audio = audioRef.current
    if (audio?.readyState && Math.abs(audio.currentTime * 1000 - state.progressMs) > 1200) audio.currentTime = state.progressMs / 1000
  }, [state.progressMs])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    if (!state.isPlaying) { audio.pause(); return }
    let cancelled = false
    setPlaybackError('')
    void getCachedPlaybackGrant(appQueryClient, track)
      .then((grant) => {
        if (cancelled) return
        if (audio.src !== grant.url) {
          audio.src = grant.url
          audio.currentTime = Math.min(state.progressMs / 1000, track.durationMs / 1000)
        }
        audio.volume = state.volume
        return audio.play()
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackError('当前歌曲需要登录或暂无播放权限')
          usePlayerStore.getState().pause()
        }
      })
    return () => { cancelled = true }
  }, [state.isPlaying, track?.id])

  useEffect(() => {
    const clampSavedPosition = () => {
      const card = cardRef.current
      if (!card) return
      setPosition((current) => current ? {
        left: Math.max(8, Math.min(current.left, window.innerWidth - card.offsetWidth - 8)),
        top: Math.max(8, Math.min(current.top, window.innerHeight - card.offsetHeight - 8)),
      } : null)
    }
    clampSavedPosition()
    window.addEventListener('resize', clampSavedPosition)
    return () => window.removeEventListener('resize', clampSavedPosition)
  }, [])

  useEffect(() => () => dragCleanupRef.current?.(), [])

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    const card = cardRef.current
    if (event.button !== 0 || !card || dragCleanupRef.current || (event.target as Element).closest('input, textarea, select, .floating-player-options')) return
    const rect = card.getBoundingClientRect()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    let finalPosition: { left: number; top: number } | null = null
    const onMove = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      const dx = pointer.clientX - startX
      const dy = pointer.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 5) return
      moved = true
      finalPosition = {
        left: Math.max(8, Math.min(rect.left + dx, window.innerWidth - card.offsetWidth - 8)),
        top: Math.max(8, Math.min(rect.top + dy, window.innerHeight - card.offsetHeight - 8)),
      }
      setPosition(finalPosition)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      dragCleanupRef.current = null
    }
    const onEnd = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return
      cleanup()
      if (finalPosition) localStorage.setItem('tmusic:player-card-position', JSON.stringify(finalPosition))
      if (moved) {
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 0)
      }
    }
    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  if (!track) return null

  return <section ref={cardRef} className="floating-player-card glass-panel" style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined} aria-label="浮动播放器" onPointerDown={startDrag} onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false } }}>
    <button className="floating-player-art" type="button" onClick={() => navigate('/player')} aria-label="打开正在播放"><TrackArtwork palette={track.palette} coverUrl={track.coverUrl} className="dock-artwork" /></button>
    <div className="floating-player-main">
      <div className="floating-player-top"><button className="floating-player-title" type="button" onClick={() => navigate('/player')} title={playbackError || track.name}><strong>{track.name}</strong><span>{track.artists.map((artist) => artist.name).join(' / ')}</span></button><TrackActions track={track} /></div>
      <div className="floating-player-progress"><input className="range-control progress-control" type="range" min={0} max={track.durationMs} value={Math.min(progressControl.value, track.durationMs)} onChange={progressControl.onChange} onPointerUp={progressControl.onPointerUp} onKeyUp={progressControl.onKeyUp} onBlur={progressControl.onBlur} style={{ '--range-progress': `${track.durationMs ? progressControl.value / track.durationMs * 100 : 0}%` } as React.CSSProperties} aria-label="播放进度" /><span>{formatDuration(progressControl.value)} / {formatDuration(track.durationMs)}</span></div>
    </div>
    <div className="floating-player-controls"><button type="button" onClick={state.previous} disabled={state.roomMode} aria-label="上一首"><SkipBack size={18} fill="currentColor" /></button><button className="floating-player-play" type="button" onClick={state.toggle} disabled={state.roomMode} aria-label={state.isPlaying ? '暂停' : '播放'}>{state.isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><button type="button" onClick={state.next} disabled={state.roomMode} aria-label="下一首"><SkipForward size={18} fill="currentColor" /></button></div>
    <div className="floating-player-features"><button className="floating-player-ai" type="button" onClick={() => navigate('/ai')} aria-label="AI 音乐对话" title="AI 音乐对话"><Sparkles size={18} /></button><button type="button" onClick={() => setOptionsOpen((value) => !value)} aria-label="更多播放功能" aria-expanded={optionsOpen}><MoreHorizontal size={21} /></button></div>
    {optionsOpen ? <div className="floating-player-options glass-panel"><button type="button" onClick={state.openQueue}><ListMusic size={17} /> 播放队列</button><button type="button" onClick={state.toggleShuffle} disabled={state.roomMode}><Shuffle size={17} /> {state.shuffle ? '关闭随机' : '随机播放'}</button><button type="button" onClick={state.cycleRepeat} disabled={state.roomMode}><Repeat2 size={17} /> 循环：{state.repeatMode === 'one' ? '单曲' : state.repeatMode === 'all' ? '列表' : '关闭'}</button><label><Volume2 size={17} /><input className="range-control volume-control" type="range" min={0} max={1} step={0.01} value={state.volume} onChange={(event) => state.setVolume(Number(event.target.value))} style={{ '--range-progress': `${state.volume * 100}%` } as React.CSSProperties} aria-label="音量" /></label></div> : null}
  </section>
}
