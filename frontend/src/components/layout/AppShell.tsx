import { Outlet } from 'react-router-dom'
import { AiOrb } from '../shared/AiOrb'
import { PlayerDock } from '../player/PlayerDock'
import { Sidebar } from './Sidebar'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getCatalogHome } from '../../lib/api'
import { usePlayerStore } from '../../stores/playerStore'

export function AppShell() {
  const { data } = useQuery({
    queryKey: ['catalog-home'], queryFn: getCatalogHome,
    refetchInterval: (query) => query.state.data?.degraded ? 10_000 : false,
  })
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
    </div>
  )
}
