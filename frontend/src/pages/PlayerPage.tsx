import { ListMusic } from 'lucide-react'
import { useState } from 'react'
import { PlaybackQueueList } from '../components/player/PlaybackQueueList'
import { ScrollingTitle } from '../components/player/ScrollingTitle'
import { SyncedLyrics } from '../components/player/SyncedLyrics'
import { usePlayerStore } from '../stores/playerStore'

export function PlayerPage() {
  const [activeTab, setActiveTab] = useState<'lyrics' | 'queue'>('lyrics')
  const state = usePlayerStore()
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  if (!track) return null
  return <div className="immersive-page full-player-page page-with-player">
    <div className="ambient-petals" />
    <section className="full-track-copy"><span>NOW PLAYING</span><ScrollingTitle text={track.name} /><h2>{track.artists.map((artist) => artist.name).join(' / ')}</h2>{track.album?.name ? <p>{track.album.name}</p> : null}</section>
    <aside className="lyrics-panel glass-panel"><nav><button type="button" className={activeTab === 'lyrics' ? 'active' : ''} onClick={() => setActiveTab('lyrics')}>歌词</button><button type="button" className={activeTab === 'queue' ? 'active' : ''} onClick={() => setActiveTab('queue')}>播放队列</button><ListMusic /></nav>{activeTab === 'lyrics' ? <SyncedLyrics sourceId={track.sourceId} progressMs={state.progressMs} onSeek={state.seek} /> : <PlaybackQueueList />}</aside>
  </div>
}
