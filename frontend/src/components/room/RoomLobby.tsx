import { Link2, LockKeyhole, Music2, Play, RadioTower, RefreshCw, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { TrackRef } from '@tmusic/contracts'
import { createRoom, ensureRoomSession, getPublicRooms } from '../../lib/api'
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
  const publicRooms = useQuery({ queryKey: ['public-rooms'], queryFn: getPublicRooms, staleTime: 15_000 })
  const { data: account } = useQuery(queries.accountStatus())
  const [name, setName] = useState('一起听歌')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PASSWORD' | 'INVITE_ONLY'>('INVITE_ONLY')
  const [password, setPassword] = useState('')
  const [maxMembers, setMaxMembers] = useState(2)
  const [allowTrackRequests, setAllowTrackRequests] = useState(true)
  const [messageRetention, setMessageRetention] = useState<'EPHEMERAL' | 'PERSISTENT'>('EPHEMERAL')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await ensureRoomSession()
      const initialQueue = queue.filter((item) => !item.sourceId.startsWith('demo-')).slice(0, 50).map(toTrackRef)
      const created = await createRoom({ name: name.trim(), visibility, password: visibility === 'PASSWORD' ? password : undefined, maxMembers, settings: { controlMode: 'HOST_ONLY', allowTrackRequests, chatEnabled: true, messageRetention }, initialQueue })
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
      if (!match) throw new Error('请输入有效的房间链接或编号')
      navigate(`/room/${encodeURIComponent(match[1]!)}${url.search}`)
    } catch {
      if (/^room_[A-Za-z0-9_-]+$/.test(value)) navigate(`/room/${value}`)
      else setError('请输入有效的房间链接或编号')
    }
  }

  return <div className="room-page room-lobby-page page-with-player">
    <div className="room-scene-shade" />
    <main className="room-lobby-content">
      <header className="room-lobby-heading"><span>LISTEN TOGETHER <i /></span><h1>一起听歌</h1><p>在同一个旋律里，和重要的人更靠近。</p></header>
      <form className="room-invite-card glass-panel" onSubmit={(event) => void onCreate(event)}>
        <RoomConnection left={account?.profile?.nickname ?? '我'} right="邀请一个人" leftImage={account?.authenticated ? account.profile?.avatarUrl : undefined} emptyRight />
        <div className="room-feature-grid">
          <div><Play size={19} fill="currentColor" /><span><strong>同步播放</strong><small>一起听，同步进行</small></span><i /></div>
          <div><Music2 size={19} /><span><strong>共享歌单</strong><small>看到相同的心动</small></span><i /></div>
          <div><Users size={19} /><span><strong>私密空间</strong><small>只属于你们的空间</small></span><i /></div>
        </div>
        <button className="room-start-button" type="submit" disabled={busy}><Play size={19} fill="currentColor" />{busy ? '正在创建…' : '开始共听'}</button>
        <div className="room-invite-divider"><span>或通过其他方式加入</span></div>
        <div className="room-join-form"><input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="粘贴邀请链接或房间编号" aria-label="邀请链接或房间编号" /><button type="button" onClick={onJoin} disabled={!invite.trim()}><Link2 size={18} /> 加入房间</button></div>
        <details className="room-create-options"><summary>房间设置</summary><div className="room-option-grid">
          <label>房间名称<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required /></label>
          <label>加入方式<select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="INVITE_ONLY">邀请链接</option><option value="PUBLIC">公开房间</option><option value="PASSWORD">房间口令</option></select></label>
          {visibility === 'PASSWORD' && <label>房间口令<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={4} maxLength={32} required /></label>}
          <label>人数上限<input type="number" min={2} max={100} value={maxMembers} onChange={(event) => setMaxMembers(Number(event.target.value))} /></label>
          <label>聊天记录<select value={messageRetention} onChange={(event) => setMessageRetention(event.target.value as typeof messageRetention)}><option value="EPHEMERAL">房间结束后删除</option><option value="PERSISTENT">保存 30 天</option></select></label>
          <label className="room-option-check"><input type="checkbox" checked={allowTrackRequests} onChange={(event) => setAllowTrackRequests(event.target.checked)} />允许成员点歌</label>
        </div></details>
        {error && <p className="room-inline-error" role="alert">{error}</p>}
        <RoomTrackTile track={track} onPlay={track ? () => usePlayerStore.getState().play(track) : undefined} />
      </form>
      <section className="room-public-rooms"><header><span><RadioTower size={17} /> 发现公开房间</span><button type="button" onClick={() => void publicRooms.refetch()} aria-label="刷新公开房间"><RefreshCw size={16} /></button></header>
        {publicRooms.isPending ? <p>正在寻找房间…</p> : publicRooms.isError ? <p>暂时无法读取公开房间。</p> : !publicRooms.data.items.length ? <p><LockKeyhole size={15} /> 暂无公开房间，先创建一个吧。</p> : publicRooms.data.items.map((room) => <button key={room.id} type="button" onClick={() => navigate(`/room/${room.id}`)}><strong>{room.name}</strong><span>{room.trackName ?? '等待播放'} · {room.members}/{room.maxMembers} 人</span></button>)}
      </section>
    </main>
  </div>
}
