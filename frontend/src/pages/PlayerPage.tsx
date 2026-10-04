import { PlaybackContentPanel } from '../components/player/PlaybackContentPanel'
import { ScrollingTitle } from '../components/player/ScrollingTitle'
import { usePlayerStore } from '../stores/playerStore'

export function PlayerPage() {
  const state = usePlayerStore()
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  if (!track) return null
  return <div className="immersive-page full-player-page page-with-player">
    <div className="ambient-petals" />
    <section className="full-track-copy"><span>NOW PLAYING</span><ScrollingTitle text={track.name} /><h2>{track.artists.map((artist) => artist.name).join(' / ')}</h2>{track.album?.name ? <p>{track.album.name}</p> : null}</section>
    <PlaybackContentPanel sourceId={track.sourceId} progressMs={state.progressMs} onSeek={state.seek} />
  </div>
}
