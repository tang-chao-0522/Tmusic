import { Bell, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queries } from '../../lib/queries'

export function PageTopbar() {
  const navigate = useNavigate()
  const { data: account } = useQuery(queries.accountStatus())

  return (
    <header className="page-topbar">
      <button className="global-search" type="button" onClick={() => navigate('/search')}>
        <Search size={18} />
        <span>搜索喜欢的歌曲、歌手或专辑...</span>
        <kbd>⌘ K</kbd>
      </button>
      <button className="icon-button notification-button" type="button" aria-label="通知">
        <Bell size={21} strokeWidth={1.7} />
        <span className="notification-dot" />
      </button>
      <NavLink className="topbar-profile" to="/account" aria-label="个人中心">{account?.authenticated && account.profile?.avatarUrl ? <img src={account.profile.avatarUrl} alt="" /> : account?.profile?.nickname?.slice(0, 1) || '我'}</NavLink>
    </header>
  )
}
