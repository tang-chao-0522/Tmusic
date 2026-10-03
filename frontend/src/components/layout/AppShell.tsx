import { Outlet } from 'react-router-dom'
import { AiOrb } from '../shared/AiOrb'
import { PlayerDock } from '../player/PlayerDock'
import { PlaybackQueueDrawer } from '../player/PlaybackQueueDrawer'
import { Sidebar } from './Sidebar'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { queries } from '../../lib/queries'
import { usePlayerStore } from '../../stores/playerStore'

export function AppShell() {
  const { data } = useQuery(queries.catalogHome())
  const loadCatalogTracks = usePlayerStore((state) => state.loadCatalogTracks)
  useEffect(() => {
    if (data && !data.degraded) loadCatalogTracks(data.recommendations)
  }, [data, loadCatalogTracks])
  return (
    <div className="app-frame">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      <AiOrb />
      <PlayerDock />
      <PlaybackQueueDrawer />
    </div>
  )
}
