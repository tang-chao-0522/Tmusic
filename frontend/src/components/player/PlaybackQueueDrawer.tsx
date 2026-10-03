import { useEffect, useRef, useState } from 'react'
import { ListMusic, X } from 'lucide-react'
import { PlaybackQueueList } from './PlaybackQueueList'
import { usePlayerStore } from '../../stores/playerStore'

export function PlaybackQueueDrawer() {
  const queueOpen = usePlayerStore((state) => state.queueOpen)
  const queueLength = usePlayerStore((state) => state.queue.length)
  const closeQueue = usePlayerStore((state) => state.closeQueue)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [rendered, setRendered] = useState(queueOpen)

  useEffect(() => {
    if (queueOpen) { setRendered(true); return }
    const timer = window.setTimeout(() => setRendered(false), 240)
    return () => window.clearTimeout(timer)
  }, [queueOpen])

  useEffect(() => {
    if (!queueOpen) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeQueue() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [queueOpen, closeQueue])

  if (!rendered) return null
  return <div className={`queue-drawer-backdrop ${queueOpen ? 'is-open' : 'is-closing'}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeQueue() }}>
    <section className="queue-drawer glass-panel" role="dialog" aria-modal="true" aria-labelledby="queue-drawer-title">
      <header><div><ListMusic size={21} /><h2 id="queue-drawer-title">播放队列</h2><span>{queueLength} 首</span></div><button ref={closeRef} type="button" aria-label="关闭播放队列" onClick={closeQueue}><X size={20} /></button></header>
      <PlaybackQueueList onSelect={closeQueue} />
    </section>
  </div>
}
