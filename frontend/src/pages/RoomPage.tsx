import { ROOM_CAPACITY, type ChatMessage, type PlaybackState, type RoomCommand, type RoomQueueCommand, type TrackRef } from '@tmusic/contracts'
import { Copy, Crown, MessageCircle, Pause, Play, RadioTower, Send, SkipForward, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useQuery } from '@tanstack/react-query'
import { RoomLobby } from '../components/room/RoomLobby'
import { RoomConnection } from '../components/room/RoomVisuals'
import { PlaybackContentPanel } from '../components/player/PlaybackContentPanel'
import { usePlaybackSeek } from '../components/player/usePlaybackSeek'
import { formatDuration, type DemoTrack } from '../data/tracks'
import { ApiError, endRoom, ensureRoomSession, getRoomSnapshot, leaveRoom, realtimeOrigin, refreshRoomSnapshot, searchCatalog, toUiTrack, type RoomSnapshot } from '../lib/api'
import { onRoomPlayRequested, onRoomSeekRequested, onRoomTrackEnded } from '../lib/roomPlaybackEvents'
import { getAudioEngine, resumeAudio, setAudioRate } from '../lib/audioEngine'
import { usePlayerStore } from '../stores/playerStore'
import { queries } from '../lib/queries'

type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: { message: string; code: string } }
type RoomEntry = { roomId: string; inviteCode?: string }
const ACTIVE_ROOM_KEY = 'tmusic:active-room'

function roomFromLocation(pathname: string, search: string): RoomEntry | null {
  const match = pathname.match(/^\/room\/([^/]+)$/)
  if (!match) return null
  try { return { roomId: decodeURIComponent(match[1]!), inviteCode: new URLSearchParams(search).get('code') ?? undefined } }
  catch { return null }
}

function storedRoom(): RoomEntry | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ACTIVE_ROOM_KEY) ?? 'null') as RoomEntry | null
    return value && typeof value.roomId === 'string' && value.roomId ? value : null
  } catch { return null }
}

function saveRoom(room: RoomEntry | null) {
  try {
    if (room) sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(room))
    else sessionStorage.removeItem(ACTIVE_ROOM_KEY)
  } catch { /* The active connection still survives client-side navigation. */ }
}

export function RoomPage() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const routeRoom = roomFromLocation(pathname, search)
  const [activeRoom, setActiveRoom] = useState<RoomEntry | null>(() => routeRoom ?? storedRoom())
  const closingRoomRef = useRef(false)
  const closedLocationRef = useRef('')
  const roomRoute = pathname === '/room' || Boolean(routeRoom)

  useEffect(() => {
    const entry = roomFromLocation(pathname, search)
    if (entry) {
      if (closingRoomRef.current && closedLocationRef.current === `${pathname}${search}`) return
      closingRoomRef.current = false
      setActiveRoom((current) => current?.roomId === entry.roomId && current.inviteCode === entry.inviteCode ? current : entry)
      saveRoom(entry)
    } else if (pathname === '/room' && !activeRoom) closingRoomRef.current = false
  }, [pathname, search, activeRoom])

  useEffect(() => {
    if (pathname === '/room' && activeRoom && !closingRoomRef.current) {
      navigate(`/room/${encodeURIComponent(activeRoom.roomId)}${activeRoom.inviteCode ? `?code=${encodeURIComponent(activeRoom.inviteCode)}` : ''}`, { replace: true })
    }
  }, [pathname, activeRoom, navigate])

  const closeRoom = useCallback(() => {
    closingRoomRef.current = true
    closedLocationRef.current = `${window.location.pathname}${window.location.search}`
    saveRoom(null)
    setActiveRoom(null)
    if (window.location.pathname === '/room' || window.location.pathname.startsWith('/room/')) navigate('/room', { replace: true })
  }, [navigate])

  if (!roomRoute && !activeRoom) return null
  return <div hidden={!roomRoute}>{activeRoom ? <LiveRoom roomId={activeRoom.roomId} inviteCode={activeRoom.inviteCode} onClose={closeRoom} /> : <RoomLobby />}</div>
}

function LiveRoom({ roomId, inviteCode, onClose }: RoomEntry & { onClose: () => void }) {
  const [retry, setRetry] = useState(0)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [connection, setConnection] = useState('正在连接…')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const { data: account } = useQuery(queries.accountStatus())
  const socketRef = useRef<Socket | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const offsetRef = useRef(0)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const player = usePlayerStore()
  const search = useQuery({ queryKey: ['room-song-search', searchKeyword], queryFn: ({ signal }) => searchCatalog(searchKeyword, 'song', 0, 8, signal), enabled: searchKeyword.length > 1, staleTime: 60_000 })
  const role = snapshot?.room.role
  const canControl = role === 'HOST'
  const track = snapshot?.playback.track ? toUiTrack(snapshot.playback.track) : null
  const currentPosition = player.roomMode ? player.progressMs : snapshot?.playback.positionMs ?? 0
  const progressControl = usePlaybackSeek(currentPosition, (positionMs) => playback('SEEK', { positionMs }), true, track?.id)
  const shareUrl = `${window.location.origin}/room/${roomId}?code=${encodeURIComponent(inviteCode ?? '')}`

  useEffect(() => { const timer = window.setTimeout(() => setSearchKeyword(searchTerm.trim()), 300); return () => window.clearTimeout(timer) }, [searchTerm])

  useEffect(() => {
    let active = true
    let socket: Socket | null = null
    let timer: number | undefined
    let onCanPlay: (() => void) | null = null
    setSnapshot(null); snapshotRef.current = null
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
        const initial = await getRoomSnapshot(roomId, inviteCode)
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
        socket.on('room:members', (event: { members: RoomSnapshot['members']; ownerId: string }) => setSnapshot((current) => {
          if (!current) return current
          const ownerId = event.ownerId ?? current.room.ownerId
          const role = ownerId === session.userId ? 'HOST' as const : 'MEMBER' as const
          const next = { ...current, members: event.members, room: { ...current.room, ownerId, role } }
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
        socket.on('room:ended', () => onCloseRef.current())
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
      } catch (cause) {
        if (!active) return
        if (cause instanceof ApiError && ['ROOM_ENDED', 'ROOM_FULL', 'INVITE_REQUIRED'].includes(cause.code)) { onCloseRef.current(); return }
        setConnection('无法进入房间'); setError(cause instanceof Error ? cause.message : '房间加载失败')
      }
    })()
    return () => { active = false; if (timer) window.clearInterval(timer); if (onCanPlay) getAudioEngine().removeEventListener('canplay', onCanPlay); setAudioRate(1); socket?.disconnect(); socketRef.current = null; snapshotRef.current = null; usePlayerStore.getState().leaveRoom() }
  }, [roomId, inviteCode, retry])

  useEffect(() => {
    const stopEnded = onRoomTrackEnded(() => {
      const current = snapshotRef.current
      if (!current || current.room.role !== 'HOST') return
      const type = current.queue.length > 1 ? 'NEXT' : 'PAUSE'
      void send('playback:command', { commandId: crypto.randomUUID(), knownStateVersion: current.playback.stateVersion, type })
    })
    const stopRequested = onRoomPlayRequested((track, tracks) => {
      const current = snapshotRef.current
      if (!current) { setError('房间尚未连接，请稍后重试'); return }
      if (track.provider !== 'netease' || !/^\d+$/.test(track.sourceId)) { setError('这首歌曲暂时无法在房间播放'); return }
      void send('queue:command', { commandId: crypto.randomUUID(), knownQueueVersion: current.playback.queueVersion, type: 'ADD_AND_PLAY', track: toTrackRef(track), tracks: tracks?.map(toTrackRef) })
    })
    const stopSeek = onRoomSeekRequested((positionMs) => {
      const current = snapshotRef.current
      if (!current) { setError('房间尚未连接，请稍后重试'); return }
      void send('playback:command', { commandId: crypto.randomUUID(), knownStateVersion: current.playback.stateVersion, type: 'SEEK', positionMs })
    })
    return () => { stopEnded(); stopRequested(); stopSeek() }
  }, [roomId])

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
    if (type === 'SEEK' && extra.positionMs !== undefined) usePlayerStore.getState().updateProgress(extra.positionMs)
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
    onClose()
  }

  async function end() {
    try { await endRoom(roomId); onClose() } catch (cause) { setError(cause instanceof Error ? cause.message : '结束房间失败') }
  }

  return <div className="room-page room-live-page page-with-player"><div className="room-scene-shade" />
    <header className="room-header glass-panel"><div className="room-title"><span className="live-pulse" /><div><span className="eyebrow">LISTENING ROOM · {connection}</span><h1>{snapshot?.room.name ?? '正在进入房间'}</h1></div></div>
      <div className="room-header-actions"><span className="member-count"><Users size={17} /> {snapshot?.members.length ?? 0} / {ROOM_CAPACITY}</span>
        {snapshot && inviteCode ? <button type="button" className="secondary-pill" onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => setError('复制失败，请检查浏览器剪贴板权限')) }}><Copy size={16} /> {copied ? '已复制' : '邀请朋友'}</button> : null}
        <button type="button" className="secondary-pill" onClick={() => void leave()}><X size={16} /> 退出</button></div></header>
    {error ? <div className="room-error" role="alert">{error}{!snapshot ? <button type="button" onClick={() => setRetry((value) => value + 1)}>重试</button> : null}</div> : null}
    {snapshot ? <div className="room-layout"><section className="room-stage">
      <RoomConnection left={account?.profile?.nickname ?? snapshot.members.find((member) => member.userId === sessionId)?.name ?? '我'} right={snapshot.members.find((member) => member.userId !== sessionId)?.name ?? '邀请一个人'} leftImage={account?.authenticated ? account.profile?.avatarUrl : undefined} emptyRight={snapshot.members.length < 2} />
      <span className="room-sync-label"><RadioTower size={15} /> {connection === '已连接' ? 'In Sync' : connection}</span>
      <div className="room-track-copy"><span className="eyebrow">NOW PLAYING</span><h2>{track?.name ?? '房间队列还没有歌曲'}</h2><p>{track?.artists.map((artist) => artist.name).join(' / ') ?? '从下面的队列添加歌曲'}</p></div>
      {snapshot.playback.isPlaying && !player.isPlaying ? <button className="room-resume" type="button" onClick={() => { void resumeAudio().then(() => { const current = snapshotRef.current; if (current) { const queue = current.queue.map(toUiTrack); usePlayerStore.getState().syncRoom(queue, current.playback.track ? `${current.playback.track.provider}:${current.playback.track.sourceId}` : '', currentPosition, true) } }).catch(() => setError('此歌曲暂时无法播放，请检查账号或播放权限')) }}>点击继续播放</button> : null}
      <div className="room-controls"><button type="button" className="room-play-button" disabled={!canControl || !track || connection !== '已连接'} onClick={() => playback(snapshot.playback.isPlaying ? 'PAUSE' : 'PLAY')} aria-label={snapshot.playback.isPlaying ? '暂停' : '播放'}>{snapshot.playback.isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button><button type="button" disabled={!canControl || snapshot.queue.length < 2} onClick={() => playback('NEXT')} aria-label="下一首"><SkipForward /></button></div>
      <div className="room-progress"><span>{formatDuration(progressControl.value)}</span><input type="range" min={0} max={track?.durationMs ?? 0} value={Math.min(progressControl.value, track?.durationMs ?? 0)} disabled={!track || connection !== '已连接'} onChange={progressControl.onChange} onPointerUp={progressControl.onPointerUp} onKeyUp={progressControl.onKeyUp} onBlur={progressControl.onBlur} aria-label="房间播放进度" /><span>{formatDuration(track?.durationMs ?? 0)}</span></div>
      <div className="host-note"><Crown size={16} /> {role === 'HOST' ? '你是房主 · 可以控制播放' : '可选歌播放和调整共听进度'}</div>
    </section><PlaybackContentPanel
      className="room-social"
      sourceId={track?.sourceId ?? null}
      progressMs={currentPosition}
      onSeek={(position) => playback('SEEK', { positionMs: position })}
      tracks={snapshot.queue.map(toUiTrack)}
      currentId={track?.id}
      onPlay={(_, index) => queueCommand('ADD_AND_PLAY', { track: snapshot.queue[index] })}
      queueActions={canControl ? (_, index) => <span className="room-queue-actions">
        <button type="button" disabled={index === 0} onClick={() => queueCommand('MOVE', { index, toIndex: index - 1 })} aria-label={`上移 ${snapshot.queue[index]?.name}`}>↑</button>
        <button type="button" disabled={index === snapshot.queue.length - 1} onClick={() => queueCommand('MOVE', { index, toIndex: index + 1 })} aria-label={`下移 ${snapshot.queue[index]?.name}`}>↓</button>
        <button type="button" onClick={() => queueCommand('REMOVE', { index })} aria-label={`移除 ${snapshot.queue[index]?.name}`}><X size={14} /></button>
      </span> : undefined}
      queueFooter={<div className="room-queue-footer">
        {player.personalSnapshot?.queue.filter((item) => !item.sourceId.startsWith('demo-') && !snapshot.queue.some((song) => song.sourceId === item.sourceId)).slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => queueCommand('ADD', { track: toTrackRef(item) })}>＋ 添加 {item.name}</button>)}
        <div className="room-song-search"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索歌曲加入房间" aria-label="搜索房间歌曲" />{searchTerm.trim().length > 1 ? searchKeyword !== searchTerm.trim() || search.isPending ? <small>搜索中…</small> : search.isError ? <small>搜索失败，请重试</small> : (search.data.items as DemoTrack[]).map((item) => <button key={item.id} type="button" onClick={() => { queueCommand('ADD', { track: toTrackRef(item) }); setSearchTerm('') }}>＋ {item.name} · {item.artists[0]?.name}</button>) : null}</div>
      </div>}
      extraTab={{ label: '聊天', content: <>
        <div className="room-panel-head"><div><span className="eyebrow">ROOM CHAT</span><h2>房间聊天</h2></div>{role === 'HOST' ? <button type="button" onClick={() => void end()} title="结束房间">结束房间</button> : null}</div>
        <div className="member-strip">{snapshot.members.map((member) => <span key={member.userId} className="room-member"><span className="member-avatar" title={`${member.name}${member.userId === snapshot.room.ownerId ? ' · 房主' : ''} · ${member.connections ? member.ready ? '已准备' : '在线' : '暂时离线'}`}>{member.name.slice(0, 1)}{member.userId === snapshot.room.ownerId ? <Crown size={10} /> : null}</span></span>)}</div>
        <div className="room-messages">{messages.map((message) => <div key={message.id} className={`room-message ${message.sender.id === sessionId ? 'own' : ''}`}><span className="message-avatar">{message.sender.displayName.slice(0, 1)}</span><div><small>{message.sender.displayName} · {new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small><p>{message.text}</p></div></div>)}</div>
        <form className="room-composer" onSubmit={sendMessage}><MessageCircle size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="聊聊正在听的歌…" maxLength={500} /><button type="submit" disabled={!draft.trim() || connection !== '已连接'}><Send size={17} /></button></form>
      </> }}
    /></div> : null}
  </div>
}

function toTrackRef(track: DemoTrack): TrackRef {
  return { provider: track.provider, sourceId: track.sourceId, name: track.name, artists: track.artists, album: track.album, durationMs: track.durationMs, coverUrl: track.coverUrl, availability: track.availability }
}
