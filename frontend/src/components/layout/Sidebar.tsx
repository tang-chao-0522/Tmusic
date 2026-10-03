import { Clock3, Heart, Home, Library, Music2, RadioTower, Search, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queries } from '../../lib/queries'

const navItems = [
  { to: '/discover', label: '发现', icon: Home },
  { to: '/search', label: '搜索', icon: Search },
  { to: '/library', label: '音乐库', icon: Library },
  { to: '/favorites', label: '喜欢', icon: Heart },
  { to: '/room', label: '一起听', icon: RadioTower },
  { to: '/ai', label: 'AI 音乐助手', icon: Sparkles },
]

export function Sidebar() {
  const { data: account } = useQuery(queries.accountStatus())
  return (
    <aside className="sidebar" aria-label="主导航">
      <NavLink to="/discover" className="brand-mark" aria-label="TMusic 首页">
        <span className="brand-ring" />
        <span className="brand-star">✦</span>
      </NavLink>

      <nav className="side-nav">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} title={label}>
            <Icon size={22} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-divider" />
      <button className="side-action" type="button" title="最近播放">
        <Clock3 size={21} strokeWidth={1.7} />
      </button>
      <button className="side-action" type="button" title="探索电台">
        <Music2 size={21} strokeWidth={1.7} />
      </button>

      <div className="sidebar-spacer" />
      <NavLink to="/account" className="profile-button" title="个人中心" aria-label="个人中心">
        {account?.authenticated && account.profile?.avatarUrl ? <img src={account.profile.avatarUrl} alt="" /> : <span>{account?.profile?.nickname?.slice(0, 1) || '我'}</span>}
      </NavLink>
    </aside>
  )
}
