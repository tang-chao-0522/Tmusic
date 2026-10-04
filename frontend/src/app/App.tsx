import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AiPage } from '../pages/AiPage'
import { DiscoverPage } from '../pages/DiscoverPage'
import { FavoritesPage } from '../pages/FavoritesPage'
import { SearchPage } from '../pages/SearchPage'
import { LibraryPage } from '../pages/LibraryPage'
import { PlayerPage } from '../pages/PlayerPage'
import { AccountPage } from '../pages/AccountPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/room" element={null} />
        <Route path="/room/:roomId" element={null} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/login" element={<AccountPage />} />
      </Route>
    </Routes>
  )
}
