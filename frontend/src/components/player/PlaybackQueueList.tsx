import { TrackListItem } from '../music/TrackListItem'
import { usePlayerStore } from '../../stores/playerStore'

export function PlaybackQueueList({ onSelect }: { onSelect?: () => void }) {
  const queue = usePlayerStore((state) => state.queue)
  const currentId = usePlayerStore((state) => state.currentId)
  const play = usePlayerStore((state) => state.play)

  return <div className="playback-queue-list" aria-label="播放队列歌曲列表">
    {queue.length ? queue.map((track) => <TrackListItem
      key={track.id} track={track} variant="queue" active={track.id === currentId}
      onPlay={() => { play(track); onSelect?.() }}
    />) : <p>播放队列为空</p>}
  </div>
}
