import { Check, ChevronDown, Copy, Crown, Headphones, Lock, MessageCircle, Mic2, MoreHorizontal, Pause, Play, RadioTower, Send, Settings2, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { PageTopbar } from '../components/layout/PageTopbar'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { demoTracks } from '../data/tracks'
import { usePlayerStore } from '../stores/playerStore'

type RoomMessage = { id: number; user: string; text: string; time: string; own?: boolean }

const initialMessages: RoomMessage[] = [
  { id: 1, user: '北岛来信', text: '刚好赶上最喜欢的一首。', time: '21:03' },
  { id: 2, user: '一颗蓝莓', text: '今晚的歌单也太适合看夜景了', time: '21:04' },
  { id: 3, user: '澪', text: '下一首也很温柔，先不剧透。', time: '21:05', own: true },
]

export function RoomPage() {
  const player = usePlayerStore()
  const track = demoTracks.find((item) => item.id === player.currentId) ?? demoTracks[1]!
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [retention, setRetention] = useState<'EPHEMERAL' | 'PERSISTENT'>('EPHEMERAL')
  const [copied, setCopied] = useState(false)

  function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setMessages((items) => [...items, { id: Date.now(), user: '澪', text: draft.trim(), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), own: true }])
    setDraft('')
  }

  return (
    <div className="room-page page-with-player">
      <PageTopbar compact />
      <header className="room-header glass-panel">
        <div className="room-title"><span className="live-pulse" /><div><span className="eyebrow">LISTENING ROOM · LIVE</span><h1>樱花落下以前</h1></div></div>
        <div className="room-header-actions">
          <span className="member-count"><Users size={17} /> 4 / 20</span>
          <button type="button" className="secondary-pill" onClick={() => { navigator.clipboard?.writeText('TMUSIC-8K4P2Q').catch(() => undefined); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={17} /> : <Copy size={17} />} {copied ? '已复制' : '邀请朋友'}</button>
          <button className="icon-button" type="button"><Settings2 size={19} /></button>
        </div>
      </header>

      <div className="room-layout">
        <section className="room-stage glass-panel">
          <div className="room-visual">
            <div className="room-art-glow" style={{ background: `radial-gradient(circle, ${track.palette[0]}99, transparent 68%)` }} />
            <TrackArtwork palette={track.palette} className="room-artwork" />
            <span className="sync-badge"><RadioTower size={14} /> 已同步 · 42 ms</span>
          </div>
          <div className="room-track-copy"><span className="eyebrow">NOW PLAYING</span><h2>{track.name}</h2><p>{track.artists[0]?.name} · {track.album?.name}</p></div>
          <button className="room-play-button" type="button" onClick={player.toggle}>{player.isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button>
          <div className="room-progress"><span>2:34</span><div><i style={{ width: '58%' }} /><b style={{ left: '58%' }} /></div><span>4:18</span></div>
          <div className="host-note"><Crown size={16} /> 你是房主 · 当前仅房主可以控制播放</div>
        </section>

        <aside className="room-social glass-panel">
          <div className="room-panel-head"><div><span className="eyebrow">ROOM CHAT</span><h2>房间聊天</h2></div><button type="button"><MoreHorizontal /></button></div>
          <div className="retention-select">
            <button type="button" onClick={() => setRetention((value) => value === 'EPHEMERAL' ? 'PERSISTENT' : 'EPHEMERAL')}>
              {retention === 'EPHEMERAL' ? <Lock size={14} /> : <ShieldCheck size={14} />}
              {retention === 'EPHEMERAL' ? '临时消息 · 房间结束后删除' : '保存消息 · 保留 30 天'}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="member-strip">
            {[['澪', 'host'], ['北', ''], ['莓', ''], ['七', '']].map(([name, role], index) => <span key={index} className="member-avatar">{name}{role ? <Crown size={10} /> : null}</span>)}
            <button type="button"><UserPlus size={17} /></button>
          </div>
          <div className="room-messages">
            {messages.map((message) => <div key={message.id} className={`room-message ${message.own ? 'own' : ''}`}><span className="message-avatar">{message.user.slice(0, 1)}</span><div><small>{message.user} · {message.time}</small><p>{message.text}</p></div></div>)}
          </div>
          <form className="room-composer" onSubmit={sendMessage}><MessageCircle size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="聊聊正在听的歌..." maxLength={500} /><button type="button" aria-label="语音暂未开放"><Mic2 size={17} /></button><button type="submit" disabled={!draft.trim()}><Send size={17} /></button></form>
        </aside>
      </div>
    </div>
  )
}
