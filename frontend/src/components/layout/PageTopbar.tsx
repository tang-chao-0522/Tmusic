import { Bell, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NavLink } from 'react-router-dom'

export function PageTopbar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()

  return (
    <header className={`page-topbar ${compact ? 'compact' : ''}`}>
      <button className="global-search" type="button" onClick={() => navigate('/search')}>
        <Search size={18} />
        <span>搜索喜欢的歌曲、歌手或专辑...</span>
        <kbd>⌘ K</kbd>
      </button>
      <button className="icon-button notification-button" type="button" aria-label="通知">
        <Bell size={21} strokeWidth={1.7} />
        <span className="notification-dot" />
      </button>
      <NavLink className="topbar-profile" to="/account" aria-label="个人中心">我</NavLink>
    </header>
  )
}
