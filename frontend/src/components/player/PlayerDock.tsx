import { Heart, ListMusic, Maximize2, MoreHorizontal, Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDuration } from '../../data/tracks'
import { usePlayerStore } from '../../stores/playerStore'
import { TrackArtwork } from './TrackArtwork'
import { resolvePlayback } from '../../lib/api'

export function PlayerDock() {
  const state = usePlayerStore()
  const navigate = useNavigate()
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playbackError, setPlaybackError] = useState('')

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audioRef.current = audio
    audio.ontimeupdate = () => usePlayerStore.getState().seek(Math.floor(audio.currentTime * 1000))
    audio.onended = () => usePlayerStore.getState().next()
    return () => { audio.pause(); audio.src = ''; audioRef.current = null }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    audio.volume = state.volume
  }, [state.volume, track])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    if (!state.isPlaying) { audio.pause(); return }
    let cancelled = false
    setPlaybackError('')
    void resolvePlayback(track)
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

  if (!track) return null

  return (
    <section className="player-dock glass-panel" aria-label="播放器">
      <div className="now-playing">
        <button className="dock-cover-button" type="button" onClick={() => navigate('/player')} aria-label="打开正在播放">
          <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} className="dock-artwork" />
        </button>
        <button className="track-copy" type="button" onClick={() => navigate('/player')} title={playbackError || undefined}>
          <strong>{track.name}</strong>
          <span>{track.artists.map((artist) => artist.name).join(' / ')}</span>
        </button>
        <button className="bare-button liked" type="button" aria-label="取消喜欢"><Heart size={17} fill="currentColor" /></button>
        <button className="bare-button desktop-only" type="button" aria-label="更多"><MoreHorizontal size={18} /></button>
      </div>

      <div className="player-center">
        <div className="transport-controls">
          <button className={`bare-button ${state.shuffle ? 'is-active' : ''}`} type="button" onClick={state.toggleShuffle} aria-label="随机播放"><Shuffle size={18} /></button>
          <button className="bare-button" type="button" onClick={state.previous} aria-label="上一首"><SkipBack size={19} fill="currentColor" /></button>
          <button className="play-toggle" type="button" onClick={state.toggle} aria-label={state.isPlaying ? '暂停' : '播放'}>
            {state.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button className="bare-button" type="button" onClick={state.next} aria-label="下一首"><SkipForward size={19} fill="currentColor" /></button>
          <button className={`bare-button ${state.repeatMode !== 'off' ? 'is-active' : ''}`} type="button" onClick={state.cycleRepeat} aria-label="循环模式"><Repeat2 size={18} /></button>
        </div>
        <div className="progress-row">
          <span>{formatDuration(state.progressMs)}</span>
          <input
            className="range-control progress-control"
            type="range"
            min={0}
            max={track.durationMs}
            value={Math.min(state.progressMs, track.durationMs)}
            onChange={(event) => state.seek(Number(event.target.value))}
            style={{ '--range-progress': `${(state.progressMs / track.durationMs) * 100}%` } as React.CSSProperties}
            aria-label="播放进度"
          />
          <span>{formatDuration(track.durationMs)}</span>
        </div>
      </div>

      <div className="player-extras">
        <Volume2 size={19} />
        <input
          className="range-control volume-control"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(event) => state.setVolume(Number(event.target.value))}
          style={{ '--range-progress': `${state.volume * 100}%` } as React.CSSProperties}
          aria-label="音量"
        />
        <button className="bare-button desktop-only" type="button" aria-label="播放队列"><ListMusic size={20} /></button>
        <button className="bare-button desktop-only" type="button" onClick={() => navigate('/player')} aria-label="全屏"><Maximize2 size={19} /></button>
      </div>
    </section>
  )
}
