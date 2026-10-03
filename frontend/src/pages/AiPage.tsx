import { ArrowRight, Bot, Check, ChevronRight, Music2, Plus, Send, Sparkles, StopCircle, User, WandSparkles } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { TrackArtwork } from '../components/player/TrackArtwork'
import { demoTracks } from '../data/tracks'
import { usePlayerStore } from '../stores/playerStore'

type AiMessage = { id: number; role: 'user' | 'assistant'; text: string; withRecommendations?: boolean }

const starterMessages: AiMessage[] = [
  { id: 1, role: 'assistant', text: '晚上好。我可以按心情、场景、年代或风格帮你找到合适的音乐，也可以一起整理成歌单。' },
  { id: 2, role: 'user', text: '想听一些适合雨夜阅读的华语歌，不要太悲伤。' },
  { id: 3, role: 'assistant', text: '我找了几首安静但不压抑的歌：人声都比较克制，编曲留白多，很适合雨声做背景。', withRecommendations: true },
]

export function AiPage() {
  const [messages, setMessages] = useState(starterMessages)
  const [draft, setDraft] = useState('')
  const [published, setPublished] = useState(false)
  const play = usePlayerStore((state) => state.play)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    const text = draft.trim()
    setMessages((items) => [...items, { id: Date.now(), role: 'user', text }, { id: Date.now() + 1, role: 'assistant', text: '我记下了。真实 Agent 接入后，这里会流式检索网易云歌曲并解释推荐依据。' }])
    setDraft('')
  }

  return (
    <div className="ai-page page-with-player">
      <aside className="ai-history glass-panel">
        <div className="ai-brand"><span><Sparkles size={19} /></span><div><strong>TMusic AI</strong><small>你的音乐向导</small></div></div>
        <button className="new-chat" type="button"><Plus size={17} /> 新对话</button>
        <span className="history-label">最近对话</span>
        {['雨夜阅读歌单', '适合公路旅行的歌', '认识一下 City Pop'].map((title, index) => <button className={`history-item ${index === 0 ? 'active' : ''}`} type="button" key={title}><Music2 size={15} /> <span>{title}</span><ChevronRight size={14} /></button>)}
        <div className="ai-history-foot"><WandSparkles size={16} /><span>未来将接入 Agent 与<br />个人音乐 RAG 知识库</span></div>
      </aside>

      <section className="ai-chat">
        <header className="ai-chat-header"><div><span className="ai-status-dot" /><span>TMusic AI 在线</span></div><button type="button">清空上下文</button></header>
        <div className="ai-chat-scroll">
          <div className="ai-welcome"><span className="ai-large-orb"><Sparkles size={28} /></span><h1>想听什么，就告诉我。</h1><p>描述你的心情、此刻的场景，或者一段难以命名的感觉。</p></div>
          <div className="ai-messages">
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ${message.role}`}>
                <span className="ai-message-avatar">{message.role === 'assistant' ? <Bot size={18} /> : <User size={18} />}</span>
                <div className="ai-bubble"><p>{message.text}</p>{message.withRecommendations ? <div className="recommendation-stack">{demoTracks.slice(0, 3).map((track) => <button type="button" className="recommendation-card" key={track.id} onClick={() => play(track)}><TrackArtwork palette={track.palette} /><span><strong>{track.name}</strong><small>{track.artists[0]?.name}</small></span><i>试听 <ArrowRight size={14} /></i></button>)}<div className="playlist-draft"><div><span className="eyebrow">PLAYLIST DRAFT</span><strong>雨夜阅读 · 12 首</strong><small>发布前你可以继续增删和排序</small></div><button type="button" onClick={() => setPublished(true)}>{published ? <><Check size={15} /> 已保存</> : '保存为歌单'}</button></div></div> : null}</div>
              </div>
            ))}
          </div>
        </div>
        <form className="ai-composer glass-panel" onSubmit={submit}><button type="button" aria-label="停止生成"><StopCircle size={19} /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：找一些适合深夜写代码、不容易分心的电子乐..." rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button className="ai-send" type="submit" disabled={!draft.trim()}><Send size={18} /></button><span>AI 可能会犯错，推荐歌曲将经过播放源校验。</span></form>
      </section>
    </div>
  )
}
