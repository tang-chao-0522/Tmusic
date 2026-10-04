import { ListMusic } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { DemoTrack } from '../../data/tracks'
import { PlaybackQueueList } from './PlaybackQueueList'
import { SyncedLyrics } from './SyncedLyrics'

type PlaybackContentPanelProps = {
  sourceId: string | null
  progressMs: number
  onSeek?: (positionMs: number) => void
  tracks?: DemoTrack[]
  currentId?: string
  onPlay?: (track: DemoTrack, index: number) => void
  canSelect?: boolean
  queueActions?: (track: DemoTrack, index: number) => ReactNode
  queueFooter?: ReactNode
  extraTab?: { label: string; content: ReactNode }
  className?: string
}

export function PlaybackContentPanel({ sourceId, progressMs, onSeek, tracks, currentId, onPlay, canSelect, queueActions, queueFooter, extraTab, className = '' }: PlaybackContentPanelProps) {
  const [activeTab, setActiveTab] = useState<'lyrics' | 'queue' | 'extra'>('lyrics')

  return <aside className={`lyrics-panel glass-panel ${className}`}>
    <nav className={extraTab ? 'has-extra-tab' : undefined} aria-label="播放内容">
      <button type="button" className={activeTab === 'lyrics' ? 'active' : ''} onClick={() => setActiveTab('lyrics')}>歌词</button>
      <button type="button" className={activeTab === 'queue' ? 'active' : ''} onClick={() => setActiveTab('queue')}>播放队列</button>
      {extraTab ? <button type="button" className={activeTab === 'extra' ? 'active' : ''} onClick={() => setActiveTab('extra')}>{extraTab.label}</button> : <ListMusic aria-hidden="true" />}
    </nav>
    {activeTab === 'lyrics' ? sourceId ? <SyncedLyrics sourceId={sourceId} progressMs={progressMs} onSeek={onSeek} /> : <div className="lyrics-empty">播放歌曲后，歌词会出现在这里。</div> : null}
    {activeTab === 'queue' ? <div className="playback-queue-content"><PlaybackQueueList tracks={tracks} currentId={currentId} onPlay={onPlay} canSelect={canSelect} actions={queueActions} />{queueFooter}</div> : null}
    {activeTab === 'extra' ? extraTab?.content : null}
  </aside>
}
