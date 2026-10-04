import { Link2, Music2, Play, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TrackRef } from '@tmusic/contracts'
import { createRoom, ensureRoomSession } from '../../lib/api'
import { usePlayerStore } from '../../stores/playerStore'
import { queries } from '../../lib/queries'
import { RoomConnection, RoomTrackTile } from './RoomVisuals'
import type { DemoTrack } from '../../data/tracks'

function toTrackRef(track: DemoTrack): TrackRef {
  return { provider: track.provider, sourceId: track.sourceId, name: track.name, artists: track.artists, album: track.album, durationMs: track.durationMs, coverUrl: track.coverUrl, availability: track.availability }
}

export function RoomLobby() {
  const navigate = useNavigate()
  const queue = usePlayerStore((state) => state.queue)
  const currentId = usePlayerStore((state) => state.currentId)
  const track = queue.find((item) => item.id === currentId) ?? queue[0]
  const { data: account } = useQuery(queries.accountStatus())
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await ensureRoomSession()
      const initialQueue = queue.filter((item) => !item.sourceId.startsWith('demo-')).slice(0, 50).map(toTrackRef)
      const created = await createRoom({ initialQueue })
      const url = new URL(created.shareUrl)
      navigate(`${url.pathname}${url.search}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建房间失败') }
    finally { setBusy(false) }
  }

  function onJoin() {
    const value = invite.trim()
    try {
      const url = new URL(value, window.location.origin)
      const match = url.pathname.match(/\/room\/([^/]+)$/)
      if (!match || !url.searchParams.get('code')) throw new Error('请输入有效的邀请链接')
      navigate(`/room/${encodeURIComponent(match[1]!)}${url.search}`)
    } catch {
      setError('请输入有效的邀请链接')
    }
  }

  return <div className="room-page room-lobby-page page-with-player">
    <div className="room-scene-shade" />
    <main className="room-lobby-content">
      <header className="room-lobby-heading"><span>LISTEN TOGETHER <i /></span><h1>一起听歌</h1><p>在同一个旋律里，和重要的人更靠近。</p></header>
      <form className="room-invite-card glass-panel" onSubmit={(event) => void onCreate(event)}>
        <RoomConnection left={account?.profile?.nickname ?? '我'} right="邀请一个人" leftImage={account?.authenticated ? account.profile?.avatarUrl : undefined} emptyRight />
        <div className="room-feature-grid">
          <div><Play size={19} fill="currentColor" /><span><strong>同步播放</strong><small>一起听，同步进行</small></span></div>
          <div><Music2 size={19} /><span><strong>共享歌单</strong><small>看到相同的心动</small></span></div>
          <div><Users size={19} /><span><strong>私密空间</strong><small>只属于你们的空间</small></span></div>
        </div>
        <button className="room-start-button" type="submit" disabled={busy}><Play size={19} fill="currentColor" />{busy ? '正在创建…' : '开始共听'}</button>
        <div className="room-invite-divider"><span>或通过其他方式加入</span></div>
        <div className="room-join-form"><input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="粘贴朋友发来的邀请链接" aria-label="邀请链接" /><button type="button" onClick={onJoin} disabled={!invite.trim()}><Link2 size={18} /> 加入房间</button></div>
        {error && <p className="room-inline-error" role="alert">{error}</p>}
        <RoomTrackTile track={track} onPlay={track ? () => usePlayerStore.getState().play(track) : undefined} />
      </form>
    </main>
  </div>
}
