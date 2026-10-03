import type { ChatMessage, PlaybackState, RoomCommand, RoomQueueCommand, TrackRef } from '@tmusic/contracts'
import { Copy, Crown, Lock, MessageCircle, Pause, Play, RadioTower, Send, SkipForward, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useQuery } from '@tanstack/react-query'
import { RoomLobby } from '../components/room/RoomLobby'
import { RoomConnection } from '../components/room/RoomVisuals'
import { SyncedLyrics } from '../components/player/SyncedLyrics'
import { formatDuration, type DemoTrack } from '../data/tracks'
import { endRoom, ensureRoomSession, getRoomSnapshot, leaveRoom, realtimeOrigin, refreshRoomSnapshot, rotateRoomInvite, searchCatalog, setRoomCoHost, toUiTrack, updateRoomSettings, type RoomSnapshot } from '../lib/api'
import { onRoomTrackEnded } from '../lib/roomPlaybackEvents'
import { getAudioEngine, resumeAudio, setAudioRate } from '../lib/audioEngine'
import { usePlayerStore } from '../stores/playerStore'
import { queries } from '../lib/queries'

type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: { message: string; code: string } }

export function RoomPage() {
  const { roomId } = useParams()
  return roomId ? <LiveRoom roomId={roomId} /> : <RoomLobby />
}

function LiveRoom({ roomId }: { roomId: string }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteCode = params.get('code') ?? undefined
  const [activeInviteCode, setActiveInviteCode] = useState(inviteCode)
  const [password, setPassword] = useState('')
  const [retry, setRetry] = useState(0)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [connection, setConnection] = useState('正在连接…')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [activePanel, setActivePanel] = useState<'lyrics' | 'queue' | 'chat'>('lyrics')
  const [sessionId, setSessionId] = useState('')
  const { data: account } = useQuery(queries.accountStatus())
  const socketRef = useRef<Socket | null>(null)
  const offsetRef = useRef(0)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const player = usePlayerStore()
  const search = useQuery({ queryKey: ['room-song-search', searchKeyword], queryFn: ({ signal }) => searchCatalog(searchKeyword, 'song', 0, 8, signal), enabled: searchKeyword.length > 1, staleTime: 60_000 })
  const role = snapshot?.room.role
  const canControl = role === 'HOST' || (role === 'CO_HOST' && snapshot?.room.settings.controlMode === 'CO_HOST')
  const canAddTrack = canControl || snapshot?.room.settings.allowTrackRequests
  const track = snapshot?.playback.track ? toUiTrack(snapshot.playback.track) : null
  const currentPosition = player.roomMode ? player.progressMs : snapshot?.playback.positionMs ?? 0
  const shareUrl = `${window.location.origin}/room/${roomId}${snapshot?.room.visibility === 'INVITE_ONLY' && activeInviteCode ? `?code=${encodeURIComponent(activeInviteCode)}` : ''}`

  useEffect(() => { const timer = window.setTimeout(() => setSearchKeyword(searchTerm.trim()), 300); return () => window.clearTimeout(timer) }, [searchTerm])
  useEffect(() => setActiveInviteCode(inviteCode), [inviteCode])

  useEffect(() => {
    let active = true
    let socket: Socket | null = null
    let timer: number | undefined
    let onCanPlay: (() => void) | null = null
    setError(''); setConnection('正在连接…')

    function applyPlayback(playback: PlaybackState, queue: TrackRef[]) {
      if (!playback.isPlaying) setAudioRate(1)
      const now = Date.now() + offsetRef.current
      const position = playback.isPlaying && playback.startedAt ? playback.positionMs + Math.max(0, now - Date.parse(playback.startedAt)) : playback.positionMs
      const uiQueue = queue.map(toUiTrack)
      if (playback.track && !uiQueue.some((item) => item.sourceId === playback.track?.sourceId)) uiQueue.unshift(toUiTrack(playback.track))
      usePlayerStore.getState().syncRoom(uiQueue, playback.track ? `${playback.track.provider}:${playback.track.sourceId}` : '', Math.floor(position), playback.isPlaying)
    }

    void (async () => {
      try {
        const session = await ensureRoomSession()
        const initial = await getRoomSnapshot(roomId, inviteCode, password || undefined)
        if (!active) return
        setSessionId(session.userId)
        snapshotRef.current = initial; setSnapshot(initial); setMessages(initial.messages)
        usePlayerStore.getState().enterRoom()
        applyPlayback(initial.playback, initial.queue)
        socket = io(realtimeOrigin(), { path: '/realtime', transports: ['websocket'], withCredentials: true, auth: { ticket: initial.realtimeTicket } })
        socketRef.current = socket
        onCanPlay = () => {
          const current = snapshotRef.current
          if (current?.playback.track && socket?.connected) socket.emit('room:ready', { roomId, payload: { stateVersion: current.playback.stateVersion, trackKey: `${current.playback.track.provider}:${current.playback.track.sourceId}` } })
        }
        getAudioEngine().addEventListener('canplay', onCanPlay)
        socket.on('connect', () => { setConnection('已连接'); socket?.emit('room:join', { roomId }, (ack: Ack) => { if (!ack.ok) setError(ack.error.message); else if (getAudioEngine().readyState >= 2) onCanPlay?.() }) })
        socket.on('connect_error', (cause: Error) => {
          setConnection('连接中断'); setError(cause.message)
          if (cause.message.includes('票据')) void refreshRoomSnapshot(roomId).then((fresh) => { if (active && socket) { socket.auth = { ticket: fresh.realtimeTicket }; socket.connect() } }).catch(() => undefined)
        })
        socket.on('disconnect', () => setConnection('正在重连…'))
        socket.on('room:snapshot', (event: { payload: RoomSnapshot }) => {
          if (!active) return
          const next = { ...event.payload, realtimeTicket: initial.realtimeTicket }
          snapshotRef.current = next; setSnapshot(next); setMessages(next.messages ?? [])
          applyPlayback(next.playback, next.queue)
        })
        socket.on('room:members', (event: { members: RoomSnapshot['members']; ownerId: string; coHostIds: string[] }) => setSnapshot((current) => {
          if (!current) return current
          const ownerId = event.ownerId ?? current.room.ownerId
          const coHostIds = event.coHostIds ?? current.room.coHostIds
          const role = ownerId === session.userId ? 'HOST' as const : coHostIds.includes(session.userId) ? 'CO_HOST' as const : 'MEMBER' as const
          const next = { ...current, members: event.members, room: { ...current.room, ownerId, coHostIds, role } }
          snapshotRef.current = next; return next
        }))
        socket.on('room:details', (event: { settings: RoomSnapshot['room']['settings']; maxMembers: number; ownerId: string; coHostIds: string[] }) => setSnapshot((current) => {
          if (!current) return current
          const role = event.ownerId === session.userId ? 'HOST' as const : event.coHostIds.includes(session.userId) ? 'CO_HOST' as const : 'MEMBER' as const
          const next = { ...current, room: { ...current.room, ...event, role } }
          snapshotRef.current = next; return next
        }))
        socket.on('playback:state', (event: { payload: PlaybackState }) => setSnapshot((current) => {
          if (!current || event.payload.stateVersion <= current.playback.stateVersion) return current
          const next = { ...current, playback: event.payload }
          snapshotRef.current = next; applyPlayback(next.playback, next.queue); return next
        }))
        socket.on('queue:updated', (event: { queue: TrackRef[]; playback: PlaybackState }) => setSnapshot((current) => {
          if (!current || event.playback.queueVersion <= current.playback.queueVersion) return current
          const next = { ...current, queue: event.queue, playback: event.playback }
          snapshotRef.current = next; applyPlayback(next.playback, next.queue); return next
        }))
        socket.on('chat:message', (event: { payload: ChatMessage }) => setMessages((items) => items.some((item) => item.id === event.payload.id) ? items : [...items, event.payload]))
        socket.on('room:ended', () => { setConnection('房间已结束'); usePlayerStore.getState().leaveRoom() })
        timer = window.setInterval(() => {
          const current = snapshotRef.current
          if (!current || !socket?.connected) return
          const sentAt = Date.now()
          socket.emit('clock:ping', { clientTime: sentAt }, (ack: { serverTime: string }) => {
            const receivedAt = Date.now()
            offsetRef.current = Date.parse(ack.serverTime) - (sentAt + receivedAt) / 2
            const state = current.playback
            if (!state.isPlaying || !state.startedAt) return
            const target = state.positionMs + Date.now() + offsetRef.current - Date.parse(state.startedAt)
            const drift = target - usePlayerStore.getState().progressMs
            if (Math.abs(drift) > 1500) { setAudioRate(1); applyPlayback(state, current.queue) }
            else setAudioRate(Math.abs(drift) > 300 ? (drift > 0 ? 1.02 : 0.98) : 1)
          })
        }, 8000)
      } catch (cause) { if (active) { setConnection('无法进入房间'); setError(cause instanceof Error ? cause.message : '房间加载失败') } }
    })()
    return () => { active = false; if (timer) window.clearInterval(timer); if (onCanPlay) getAudioEngine().removeEventListener('canplay', onCanPlay); setAudioRate(1); socket?.disconnect(); socketRef.current = null; snapshotRef.current = null; usePlayerStore.getState().leaveRoom() }
  }, [roomId, inviteCode, retry])

  useEffect(() => onRoomTrackEnded(() => {
    const current = snapshotRef.current
    if (!current || current.room.role !== 'HOST') return
    const type = current.queue.length > 1 ? 'NEXT' : 'PAUSE'
    void send('playback:command', { commandId: crypto.randomUUID(), knownStateVersion: current.playback.stateVersion, type })
  }), [roomId])

  async function send(event: string, payload: object) {
    const socket = socketRef.current
    if (!socket?.connected) { setError('连接已断开，请稍后重试'); return }
    try {
      const ack = await socket.timeout(5000).emitWithAck(event, { roomId, payload }) as Ack
      if (!ack.ok) setError(ack.error.message)
      else setError('')
    } catch { setError('操作超时，请稍后重试') }
  }

  function playback(type: RoomCommand['type'], extra: Partial<RoomCommand> = {}) {
    if (!snapshot) return
    void send('playback:command', { commandId: crypto.randomUUID(), knownStateVersion: snapshot.playback.stateVersion, type, ...extra })
  }

  function queueCommand(type: RoomQueueCommand['type'], extra: Partial<RoomQueueCommand> = {}) {
    if (!snapshot) return
    void send('queue:command', { commandId: crypto.randomUUID(), knownQueueVersion: snapshot.playback.queueVersion, type, ...extra })
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    void send('chat:send', { clientMessageId: crypto.randomUUID(), text: draft.trim() })
    setDraft('')
  }

  async function leave() {
    try { await leaveRoom(roomId) } catch { /* The local room can still be closed. */ }
    socketRef.current?.disconnect()
    navigate('/room')
  }

  async function end() {
    try { await endRoom(roomId); navigate('/room') } catch (cause) { setError(cause instanceof Error ? cause.message : '结束房间失败') }
  }

  async function saveSettings(changes: Partial<Pick<RoomSnapshot['room']['settings'], 'controlMode' | 'allowTrackRequests' | 'chatEnabled'>> & { maxMembers?: number }) {
    if (!snapshot) return
    try {
      const result = await updateRoomSettings(roomId, changes)
      setSnapshot((current) => current ? { ...current, room: result.room } : current)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存房间设置失败') }
  }

  async function toggleCoHost(userId: string, enabled: boolean) {
    try { await setRoomCoHost(roomId, userId, enabled); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '设置协作者失败') }
  }

  async function resetInvite() {
    try {
      const result = await rotateRoomInvite(roomId)
      setActiveInviteCode(result.inviteCode)
      window.history.replaceState(null, '', `/room/${roomId}?code=${encodeURIComponent(result.inviteCode)}`)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '重置邀请链接失败') }
  }

  return <div className="room-page room-live-page page-with-player"><div className="room-scene-shade" />
    <header className="room-header glass-panel"><div className="room-title"><span className="live-pulse" /><div><span className="eyebrow">LISTENING ROOM · {connection}</span><h1>{snapshot?.room.name ?? '正在进入房间'}</h1></div></div>
      <div className="room-header-actions"><span className="member-count"><Users size={17} /> {snapshot?.members.length ?? 0} / {snapshot?.room.maxMembers ?? 20}</span>
        {snapshot && (snapshot.room.visibility !== 'INVITE_ONLY' || activeInviteCode) ? <button type="button" className="secondary-pill" onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => setError('复制失败，请检查浏览器剪贴板权限')) }}><Copy size={16} /> {copied ? '已复制' : '邀请朋友'}</button> : null}
        <button type="button" className="secondary-pill" onClick={() => void leave()}><X size={16} /> 退出</button></div></header>
    {error ? <div className="room-error" role="alert">{error}{!snapshot ? <><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="如需口令，请输入" /><button type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></> : null}</div> : null}
    {snapshot ? <div className="room-layout"><section className="room-stage">
      <RoomConnection left={account?.profile?.nickname ?? snapshot.members.find((member) => member.userId === sessionId)?.name ?? '我'} right={snapshot.members.find((member) => member.userId !== sessionId)?.name ?? '邀请一个人'} leftImage={account?.authenticated ? account.profile?.avatarUrl : undefined} emptyRight={snapshot.members.length < 2} />
      <span className="room-sync-label"><RadioTower size={15} /> {connection === '已连接' ? 'In Sync' : connection}</span>
      <div className="room-track-copy"><span className="eyebrow">NOW PLAYING</span><h2>{track?.name ?? '房间队列还没有歌曲'}</h2><p>{track?.artists.map((artist) => artist.name).join(' / ') ?? '从下面的队列添加歌曲'}</p></div>
      {snapshot.playback.isPlaying && !player.isPlaying ? <button className="room-resume" type="button" onClick={() => { void resumeAudio().then(() => { const current = snapshotRef.current; if (current) { const queue = current.queue.map(toUiTrack); usePlayerStore.getState().syncRoom(queue, current.playback.track ? `${current.playback.track.provider}:${current.playback.track.sourceId}` : '', currentPosition, true) } }).catch(() => setError('此歌曲暂时无法播放，请检查账号或播放权限')) }}>点击继续播放</button> : null}
      <div className="room-controls"><button type="button" className="room-play-button" disabled={!canControl || !track || connection !== '已连接'} onClick={() => playback(snapshot.playback.isPlaying ? 'PAUSE' : 'PLAY')} aria-label={snapshot.playback.isPlaying ? '暂停' : '播放'}>{snapshot.playback.isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button><button type="button" disabled={!canControl || snapshot.queue.length < 2} onClick={() => playback('NEXT')} aria-label="下一首"><SkipForward /></button></div>
      <div className="room-progress"><span>{formatDuration(currentPosition)}</span><input type="range" min={0} max={track?.durationMs ?? 0} value={Math.min(currentPosition, track?.durationMs ?? 0)} disabled={!canControl || !track} onChange={(event) => playback('SEEK', { positionMs: Number(event.target.value) })} aria-label="房间播放进度" /><span>{formatDuration(track?.durationMs ?? 0)}</span></div>
      <div className="host-note"><Crown size={16} /> {role === 'HOST' ? '你是房主 · 可以控制播放' : canControl ? '你是协作者 · 可以控制播放' : '由房主控制播放'}</div>
      <div className="room-queue" hidden={activePanel !== 'queue'}><strong>房间队列 · {snapshot.queue.length}</strong>{snapshot.queue.map((item, index) => <div key={`${item.provider}:${item.sourceId}:${index}`} className={canControl ? 'room-queue-item is-playable' : 'room-queue-item'} role={canControl ? 'button' : undefined} tabIndex={canControl ? 0 : undefined} onClick={() => { if (canControl) playback('PLAY_TRACK', { track: item }) }} onKeyDown={(event) => { if (canControl && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); playback('PLAY_TRACK', { track: item }) } }}><span>{index + 1}. {item.name}</span>{canControl ? <span><button type="button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); queueCommand('MOVE', { index, toIndex: index - 1 }) }} onKeyDown={(event) => event.stopPropagation()} aria-label={`上移 ${item.name}`}>↑</button><button type="button" disabled={index === snapshot.queue.length - 1} onClick={(event) => { event.stopPropagation(); queueCommand('MOVE', { index, toIndex: index + 1 }) }} onKeyDown={(event) => event.stopPropagation()} aria-label={`下移 ${item.name}`}>↓</button><button type="button" onClick={(event) => { event.stopPropagation(); queueCommand('REMOVE', { index }) }} onKeyDown={(event) => event.stopPropagation()} aria-label={`移除 ${item.name}`}><X size={14} /></button></span> : null}</div>)}
        {canAddTrack ? player.personalSnapshot?.queue.filter((item) => !item.sourceId.startsWith('demo-') && !snapshot.queue.some((song) => song.sourceId === item.sourceId)).slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => queueCommand('ADD', { track: toTrackRef(item) })}>＋ 添加 {item.name}</button>) : null}
        {canAddTrack ? <div className="room-song-search"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索歌曲加入房间" aria-label="搜索房间歌曲" />{searchTerm.trim().length > 1 ? searchKeyword !== searchTerm.trim() || search.isPending ? <small>搜索中…</small> : search.isError ? <small>搜索失败，请重试</small> : (search.data.items as DemoTrack[]).map((item) => <button key={item.id} type="button" onClick={() => { queueCommand('ADD', { track: toTrackRef(item) }); setSearchTerm('') }}>＋ {item.name} · {item.artists[0]?.name}</button>) : null}</div> : null}
      </div>
    </section><aside className="room-social glass-panel"><div className="room-panel-tabs"><button type="button" className={activePanel === 'lyrics' ? 'active' : ''} onClick={() => setActivePanel('lyrics')}>歌词</button><button type="button" className={activePanel === 'queue' ? 'active' : ''} onClick={() => setActivePanel('queue')}>播放队列</button><button type="button" className={activePanel === 'chat' ? 'active' : ''} onClick={() => setActivePanel('chat')}>聊天</button></div>
      {activePanel === 'lyrics' && <div className="room-live-lyrics">{track ? <SyncedLyrics sourceId={track.sourceId} progressMs={currentPosition} onSeek={(position) => { if (canControl) playback('SEEK', { positionMs: position }) }} /> : <p>播放歌曲后，歌词会出现在这里。</p>}</div>}
      {activePanel === 'queue' && <div className="room-live-queue"><h2>房间队列 · {snapshot.queue.length}</h2><p>点击歌曲播放；在左侧调整顺序或搜索添加。</p>{snapshot.queue.map((item, index) => <div key={`${item.provider}:${item.sourceId}:${index}`} className={canControl ? 'is-playable' : ''} role={canControl ? 'button' : undefined} tabIndex={canControl ? 0 : undefined} onClick={() => { if (canControl) playback('PLAY_TRACK', { track: item }) }} onKeyDown={(event) => { if (canControl && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); playback('PLAY_TRACK', { track: item }) } }}><span>{index + 1}</span><strong>{item.name}</strong><small>{item.artists.map((artist) => artist.name).join(' / ')}</small></div>)}</div>}
      {activePanel === 'chat' && <><div className="room-panel-head"><div><span className="eyebrow">ROOM CHAT</span><h2>房间聊天</h2></div>{role === 'HOST' ? <button type="button" onClick={() => void end()} title="结束房间">结束房间</button> : null}</div>
      {role === 'HOST' ? <div className="room-management"><strong>房间管理</strong>
        <label>播放控制<select value={snapshot.room.settings.controlMode} onChange={(event) => void saveSettings({ controlMode: event.target.value as 'HOST_ONLY' | 'CO_HOST' })}><option value="HOST_ONLY">仅房主</option><option value="CO_HOST">房主和协作者</option></select></label>
        <label>人数上限<input type="number" min={Math.max(2, snapshot.members.length)} max={100} value={snapshot.room.maxMembers} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= Math.max(2, snapshot.members.length) && value <= 100) void saveSettings({ maxMembers: value }) }} /></label>
        <label className="room-checkbox"><input type="checkbox" checked={snapshot.room.settings.allowTrackRequests} onChange={(event) => void saveSettings({ allowTrackRequests: event.target.checked })} />允许成员点歌</label>
        <label className="room-checkbox"><input type="checkbox" checked={snapshot.room.settings.chatEnabled} onChange={(event) => void saveSettings({ chatEnabled: event.target.checked })} />允许聊天</label>
        {snapshot.room.visibility === 'INVITE_ONLY' ? <button type="button" onClick={() => void resetInvite()}>重置邀请链接</button> : null}
      </div> : null}
      <div className="retention-select"><span><Lock size={14} /> {snapshot.room.settings.messageRetention === 'EPHEMERAL' ? '临时消息 · 房间结束后删除' : '保存消息'}</span></div>
      <div className="member-strip">{snapshot.members.map((member) => <span key={member.userId} className="room-member"><span className="member-avatar" title={`${member.name}${member.userId === snapshot.room.ownerId ? ' · 房主' : snapshot.room.coHostIds.includes(member.userId) ? ' · 协作者' : ''} · ${member.connections ? member.ready ? '已准备' : '在线' : '暂时离线'}`}>{member.name.slice(0, 1)}{member.userId === snapshot.room.ownerId || snapshot.room.coHostIds.includes(member.userId) ? <Crown size={10} /> : null}</span>{role === 'HOST' && member.userId !== sessionId ? <button type="button" onClick={() => void toggleCoHost(member.userId, !snapshot.room.coHostIds.includes(member.userId))}>{snapshot.room.coHostIds.includes(member.userId) ? '撤销协作' : '设为协作者'}</button> : null}</span>)}</div>
      <div className="room-messages">{messages.map((message) => <div key={message.id} className={`room-message ${message.sender.id === sessionId ? 'own' : ''}`}><span className="message-avatar">{message.sender.displayName.slice(0, 1)}</span><div><small>{message.sender.displayName} · {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small><p>{message.text}</p></div></div>)}</div>
      <form className="room-composer" onSubmit={sendMessage}><MessageCircle size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={snapshot.room.settings.chatEnabled ? '聊聊正在听的歌…' : '房主已关闭聊天'} disabled={!snapshot.room.settings.chatEnabled} maxLength={500} /><button type="submit" disabled={!snapshot.room.settings.chatEnabled || !draft.trim() || connection !== '已连接'}><Send size={17} /></button></form></>}
    </aside></div> : null}
  </div>
}

function toTrackRef(track: DemoTrack): TrackRef {
  return { provider: track.provider, sourceId: track.sourceId, name: track.name, artists: track.artists, album: track.album, durationMs: track.durationMs, coverUrl: track.coverUrl, availability: track.availability }
}
