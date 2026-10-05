import type { CSSProperties } from 'react'
import type { DemoTrack } from '@/data/tracks'
import { formatDuration } from '@/data/tracks'
import { TrackArtwork } from '@/components/player/TrackArtwork'
import { cn } from '@/lib/utils'
import { TrackActions } from './TrackActions'

type TrackListItemProps = {
  track: DemoTrack
  variant?: 'search' | 'quick' | 'continue' | 'recommend' | 'queue'
  onPlay: () => void
  className?: string
  style?: CSSProperties
  progress?: number
  progressLabel?: string
  active?: boolean
  disabled?: boolean
}

export function TrackListItem({ track, variant = 'search', onPlay, className, style, progress = 56, progressLabel, active = false, disabled = false }: TrackListItemProps) {
  return <div className={cn(variant === 'search' ? 'result-row' : variant === 'quick' ? 'quick-row' : variant === 'continue' ? 'continue-row' : variant === 'recommend' ? 'recommend-row' : 'queue-track-row', active && 'active', className)} style={style}>
    <button type="button" className="track-row-play" onClick={onPlay} disabled={disabled} aria-current={active ? 'true' : undefined} aria-label={`播放 ${track.name}`}>
    <TrackArtwork palette={track.palette} coverUrl={track.coverUrl} />
    <span><strong>{track.name}</strong><small>{track.artists.map((artist) => artist.name).join(' / ')}</small></span>
    {variant === 'search' ? <><em>{track.album?.name}</em><time>{formatDuration(track.durationMs)}</time></> : null}
    {variant === 'continue' ? <><i><b style={{ width: `${progress}%` }} /></i><em>{progressLabel ?? `0:00 / ${formatDuration(track.durationMs)}`}</em></> : null}
    {variant === 'recommend' ? <><em>{track.album?.name}</em><time>{formatDuration(track.durationMs)}</time></> : null}
    {variant === 'queue' ? <time>{formatDuration(track.durationMs)}</time> : null}
    </button>
    <TrackActions track={track} />
  </div>
}
