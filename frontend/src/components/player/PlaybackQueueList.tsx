import type { ReactNode } from 'react'
import type { DemoTrack } from '../../data/tracks'
import { TrackListItem } from '../music/TrackListItem'
import { usePlayerStore } from '../../stores/playerStore'

type PlaybackQueueListProps = {
  tracks?: DemoTrack[]
  currentId?: string
  onPlay?: (track: DemoTrack, index: number) => void
  onSelect?: () => void
  actions?: (track: DemoTrack, index: number) => ReactNode
  canSelect?: boolean
}

export function PlaybackQueueList({ tracks, currentId, onPlay, onSelect, actions, canSelect }: PlaybackQueueListProps) {
  const personalQueue = usePlayerStore((state) => state.queue)
  const personalCurrentId = usePlayerStore((state) => state.currentId)
  const playPersonal = usePlayerStore((state) => state.play)
  const queue = tracks ?? personalQueue
  const activeId = tracks ? currentId : personalCurrentId
  const selectable = canSelect ?? (!tracks || Boolean(onPlay))

  return <div className="playback-queue-list" aria-label="播放队列歌曲列表">
    {queue.length ? queue.map((track, index) => <div className="playback-queue-entry" key={`${track.id}:${index}`}>
      <TrackListItem track={track} variant="queue" active={track.id === activeId} disabled={!selectable}
        onPlay={() => { if (onPlay) onPlay(track, index); else if (!tracks) playPersonal(track); onSelect?.() }} />
      {actions?.(track, index)}
    </div>) : <p>播放队列为空</p>}
  </div>
}
