import Taro from '@tarojs/taro'
import { Image, Text, View } from '@tarojs/components'
import type { ReactNode } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { usePlayer } from '../lib/player'
import hero from '../assets/tmusic-hero.jpg'

export const HERO = hero
export function Icon({ name, onClick, light = false }: { name: string; onClick?: () => void; light?: boolean }) { return <View className={`icon ${light ? 'icon-light' : ''}`} onClick={onClick}><Text>{name}</Text></View> }
export function Button({ children, onClick, ghost = false, small = false }: { children: ReactNode; onClick?: () => void; ghost?: boolean; small?: boolean }) { return <View className={`ui-button ${ghost ? 'ui-button-ghost' : ''} ${small ? 'ui-button-small' : ''}`} onClick={onClick}>{children}</View> }
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <View className={`ui-card ${className}`}>{children}</View> }
export function Artwork({ url, size = 'normal' }: { url?: string | null; size?: 'normal' | 'large' }) { return url ? <Image className={`artwork artwork-${size}`} mode="aspectFill" src={url} /> : <View className={`artwork artwork-${size} artwork-fallback`}><Text>✦</Text></View> }
export function TrackRow({ track, queue, onClick }: { track: TrackRef; queue?: TrackRef[]; onClick?: () => void }) {
  const play = usePlayer(s => s.play)
  return <View className="track-row" onClick={onClick || (() => { void play(track, queue); Taro.navigateTo({ url: '/pages/player/index' }) })}><Artwork url={track.coverUrl} /><View className="track-copy"><Text className="track-name">{track.name}</Text><Text className="track-artist">{track.artists.map(a => a.name).join(' / ')}</Text></View><Text className="track-play">▶</Text></View>
}
const tabs = [{ label: '首页', icon: '⌂', path: '/pages/home/index' }, { label: '音乐库', icon: '♫', path: '/pages/library/index' }, { label: '一起听歌', icon: '♡', path: '/pages/together/index' }, { label: 'AI 助手', icon: '✦', path: '/pages/ai/index' }, { label: '我的', icon: '♙', path: '/pages/account/index' }]
export function TabBar({ active }: { active: string }) { return <View className="tabbar">{tabs.map(tab => <View key={tab.path} className={`tab ${active === tab.path ? 'active' : ''}`} onClick={() => Taro.redirectTo({ url: tab.path })}><Text className="tab-icon">{tab.icon}</Text><Text>{tab.label}</Text></View>)}</View> }
export function Page({ children, active, theme = 'light' }: { children: ReactNode; active?: string; theme?: 'light' | 'dark' }) { return <View className={`page page-${theme}`}>{children}{active && <TabBar active={active} />}</View> }
export function MiniPlayer() { const { current, playing, toggle } = usePlayer(); if (!current) return null; return <View className="mini-player" onClick={() => Taro.navigateTo({ url: '/pages/player/index' })}><Artwork url={current.coverUrl} /><View className="track-copy"><Text className="track-name">{current.name}</Text><Text className="track-artist">{current.artists[0]?.name}</Text></View><Text className="mini-toggle" onClick={e => { e.stopPropagation(); toggle() }}>{playing ? 'Ⅱ' : '▶'}</Text></View> }
export function Notice({ text, retry }: { text: string; retry?: () => void }) { return <View className="notice" onClick={retry}><Text>{text}</Text>{retry && <Text>点击重试 ↻</Text>}</View> }
