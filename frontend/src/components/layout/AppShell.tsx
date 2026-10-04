import { Outlet, useLocation } from 'react-router-dom'
import { PlayerDock } from '../player/PlayerDock'
import { PlaybackQueueDrawer } from '../player/PlaybackQueueDrawer'
import { Sidebar } from './Sidebar'
import { PageTopbar } from './PageTopbar'
import { RoomPage } from '../../pages/RoomPage'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { queries } from '../../lib/queries'
import { usePlayerStore } from '../../stores/playerStore'

export function AppShell() {
  const { pathname } = useLocation()
  const showTopbar = pathname !== '/search' && pathname !== '/ai'
  const roomRoute = pathname === '/room' || pathname.startsWith('/room/')
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const { data } = useQuery(queries.catalogHome())
  const loadCatalogTracks = usePlayerStore((state) => state.loadCatalogTracks)
  useEffect(() => {
    if (data && !data.degraded) loadCatalogTracks(data.recommendations)
  }, [data, loadCatalogTracks])
  return (
    <div className={`app-frame ${roomRoute ? 'room-route-shell' : ''} ${pathname === '/room' && !isPlaying ? 'room-lobby-shell' : ''}`}>
      <Sidebar />
      <main className="app-main">
        {showTopbar ? <PageTopbar /> : null}
        <Outlet />
        {/* The room connection and audio sync must outlive child route changes. */}
        <RoomPage />
      </main>
      <PlayerDock />
      <PlaybackQueueDrawer />
    </div>
  )
}
