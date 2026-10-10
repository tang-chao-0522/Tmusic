import { Bot, ChevronRight, Music2, Plus, Send, Sparkles, StopCircle, User } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { TrackRef } from '@tmusic/contracts'
import { TrackListItem } from '../components/music/TrackListItem'
import { AiRunProgress } from '../components/ai/AiRunProgress'
import { aiEventsUrl, ApiError, cancelAiRun, createAiConversation, deleteAiModelConfig, getAiConversation, getAiDraft, getAiModelConfig, getAiRun, listAiConversations, publishAiDraft, regenerateAiMessage, saveAiModelConfig, searchCatalog, sendAiMessage, toUiTrack, updateAiDraft, type AiConversation, type AiCustomProvider, type AiModelConfig, type AiRun } from '../lib/api'
import { usePlayerStore } from '../stores/playerStore'
import { queryKeys } from '../lib/queries'

const eventNames = ['snapshot', 'run.started', 'message.delta', 'message.completed', 'run.failed', 'run.cancelled', 'analysis.summary', 'plan.created', 'todo.updated', 'step.started', 'step.completed', 'step.failed', 'tool.started', 'content.card', 'playlist_draft.created']

export function AiPage() {
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<AiRun[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [published, setPublished] = useState<Record<string, string>>({})
  const [modelConfig, setModelConfig] = useState<AiModelConfig | null>(null)
  const [customProvider, setCustomProvider] = useState<AiCustomProvider>('openai-compatible')
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [modelBaseUrl, setModelBaseUrl] = useState('')
  const [modelName, setModelName] = useState('')
  const [modelKey, setModelKey] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; tracks: TrackRef[]; version: number } | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<TrackRef[]>([])
  const stream = useRef<EventSource | null>(null)
  const selected = useRef<string | null>(null)
  const pendingMessage = useRef<{ text: string; id: string } | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  function mergeRun(run: AiRun) {
    setRuns((items) => items.some((item) => item.id === run.id) ? items.map((item) => item.id === run.id ? run : item) : [...items, run])
  }

  async function refreshRun(id: string) {
    const run = await getAiRun(id)
    if (selected.current === run.conversationId) mergeRun(run)
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      stream.current?.close()
      stream.current = null
      setBusy(false)
    }
  }

  function watchRun(id: string, after = 0) {
    stream.current?.close()
    const source = new EventSource(aiEventsUrl(id, after), { withCredentials: true })
    stream.current = source
    for (const name of eventNames) {
      source.addEventListener(name, (event) => {
        if (name === 'message.delta') {
          const { delta } = JSON.parse((event as MessageEvent).data) as { delta: string }
          setRuns((items) => items.map((run) => run.id === id ? { ...run, answerText: run.answerText + delta } : run))
        } else {
          void refreshRun(id).catch((cause) => setError(cause instanceof Error ? cause.message : '无法更新任务状态'))
        }
      })
    }
    source.onerror = () => { void refreshRun(id).catch(() => undefined) }
  }

  async function openConversation(id: string) {
    selected.current = id
    setSelectedId(id)
    stream.current?.close()
    stream.current = null
    const conversation = await getAiConversation(id)
    if (selected.current !== id) return
    setRuns(conversation.runs)
    const active = [...conversation.runs].reverse().find((run) => run.status === 'QUEUED' || run.status === 'RUNNING')
    setBusy(Boolean(active))
    if (active) watchRun(active.id, active.latestSequence)
  }

  useEffect(() => {
    let alive = true
    void getAiModelConfig().then((config) => {
      if (!alive) return
      setModelConfig(config)
      if (config.source === 'custom') { setCustomProvider(config.provider); setModelBaseUrl(config.baseUrl); setModelName(config.model) }
      if (config.source === 'default' && !config.configured) setShowModelSettings(true)
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : '无法读取模型配置') })
    void listAiConversations().then(async (items) => {
      if (!alive) return
      setConversations(items)
      if (items[0]) await openConversation(items[0].id)
    }).catch((cause) => {
      if (alive) setError(cause instanceof ApiError && cause.code === 'AI_LOGIN_REQUIRED' ? '请先登录网易云账号，再使用音乐助手。' : cause instanceof Error ? cause.message : 'AI 服务暂时不可用')
    })
    return () => { alive = false; stream.current?.close() }
  }, [])

  async function newConversation() {
    try {
      setError('')
      const item = await createAiConversation()
      setConversations((items) => [item, ...items])
      await openConversation(item.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法创建会话') }
  }

  async function saveModel(event: FormEvent) {
    event.preventDefault()
    setSavingModel(true)
    setError('')
    try {
      const saved = await saveAiModelConfig({ provider: customProvider, baseUrl: modelBaseUrl.trim(), model: modelName.trim(), ...(modelKey.trim() ? { apiKey: modelKey.trim() } : {}) })
      setModelConfig(saved)
      setModelKey('')
      setShowModelSettings(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存模型配置失败') }
    finally { setSavingModel(false) }
  }

  async function removeModel() {
    setSavingModel(true)
    setError('')
    try {
      setModelConfig(await deleteAiModelConfig())
      setModelBaseUrl('')
      setModelName('')
      setModelKey('')
      setShowModelSettings(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '删除模型配置失败') }
    finally { setSavingModel(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    setDraft('')
    try {
      let id = selectedId
      if (!id) {
        const conversation = await createAiConversation()
        setConversations((items) => [conversation, ...items])
        id = conversation.id
        selected.current = id
        setSelectedId(id)
      }
      if (pendingMessage.current?.text !== text) pendingMessage.current = { text, id: crypto.randomUUID() }
      const response = await sendAiMessage(id, text, pendingMessage.current.id)
      pendingMessage.current = null
      const run = await getAiRun(response.runId)
      mergeRun(run)
      if (run.status === 'QUEUED' || run.status === 'RUNNING') watchRun(response.runId, run.latestSequence)
      else setBusy(false)
      setConversations((items) => items.map((item) => item.id === id && item.title === '新对话' ? { ...item, title: text.slice(0, 30) } : item))
    } catch (cause) {
      setDraft(text)
      setBusy(false)
      setError(cause instanceof Error ? cause.message : '发送失败')
    }
  }

  async function stop() {
    const active = [...runs].reverse().find((run) => run.status === 'QUEUED' || run.status === 'RUNNING')
    if (!active) return
    try { mergeRun(await cancelAiRun(active.id)); setBusy(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '停止失败') }
  }

  async function regenerate(run: AiRun) {
    try {
      const created = await regenerateAiMessage(run.messageId)
      setConversations(await listAiConversations())
      await openConversation(created.conversationId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '重新生成失败') }
  }

  async function publish(draftId: string) {
    setPublishing(draftId)
    setError('')
    try {
      const current = await getAiDraft(draftId)
      const result = current.status === 'PUBLISHED' ? current : await publishAiDraft(draftId, current.version)
      if (!result.publishedPlaylistId) throw new Error('歌单已创建，但没有返回歌单 ID，请到音乐库查看')
      setPublished((items) => ({ ...items, [draftId]: result.publishedPlaylistId! }))
      await queryClient.invalidateQueries({ queryKey: queryKeys.libraryRoot })
      navigate(`/library?playlist=${encodeURIComponent(result.publishedPlaylistId)}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发布失败') }
    finally { setPublishing(null) }
  }

  async function editDraft(draftId: string) {
    try {
      const current = await getAiDraft(draftId)
      if (current.status !== 'DRAFT') throw new Error('此歌单草稿无法编辑')
      setEditing({ id: current.id, name: current.name, tracks: current.tracks, version: current.version })
      setSearchResults([])
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法打开草稿') }
  }

  async function searchForDraft() {
    if (!searchText.trim()) return
    try {
      const result = await searchCatalog(searchText.trim(), 'song', 0, 8)
      setSearchResults(result.items as TrackRef[])
    } catch (cause) { setError(cause instanceof Error ? cause.message : '搜索失败') }
  }

  async function saveDraft() {
    if (!editing) return
    try {
      const saved = await updateAiDraft(editing.id, editing.name.trim(), editing.tracks.map((track) => track.sourceId), editing.version)
      setRuns((items) => items.map((run) => ({ ...run, cards: run.cards.map((card) => card.type === 'draft' && card.draftId === saved.id ? { ...card, name: saved.name, trackCount: saved.tracks.length } : card) })))
      setEditing(null)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '草稿保存失败') }
  }

  return (
    <div className="ai-page page-with-player">
      <aside className="ai-history glass-panel">
        <div className="ai-brand"><span><Sparkles size={19} /></span><div><strong>TMusic AI</strong><small>你的音乐向导</small></div></div>
        <button className="new-chat" type="button" onClick={() => void newConversation()}><Plus size={17} /> 新对话</button>
        <span className="history-label">最近对话</span>
        {conversations.map((item) => <button className={`history-item ${selectedId === item.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => void openConversation(item.id).catch((cause) => setError(cause instanceof Error ? cause.message : '无法打开会话'))}><Music2 size={15} /><span>{item.title}</span><ChevronRight size={14} /></button>)}
        <div className="ai-history-foot"><Sparkles size={16} /><span>计划、检索与验证进度<br />会随对话实时更新</span></div>
      </aside>

      <section className="ai-chat">
        <header className="ai-chat-header"><div><span className="ai-status-dot" /><span>{busy ? 'TMusic AI 正在处理' : 'TMusic AI'}</span></div><div className="ai-header-actions"><button type="button" onClick={() => { setModelKey(''); setShowModelSettings((value) => !value) }}>模型设置</button><button type="button" onClick={() => void newConversation()}>新对话</button></div></header>
        <div className="ai-chat-scroll">
          {showModelSettings ? <form className="ai-model-settings glass-panel" onSubmit={(event) => void saveModel(event)}>
            <h2>自定义模型</h2><p>支持 OpenAI 兼容和 Anthropic 兼容接口。Key 加密保存在后端，仅在保存时提交；页面只显示末四位。</p>
            <label>接口类型<select value={customProvider} onChange={(event) => setCustomProvider(event.target.value as AiCustomProvider)}><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic-compatible">Anthropic 兼容</option></select></label>
            <label>Base URL<input type="url" required value={modelBaseUrl} onChange={(event) => setModelBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="url" /></label>
            <label>模型名称<input required value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="model-id" autoComplete="off" /></label>
            <label>API Key {modelConfig?.source === 'custom' ? <small>已保存：{modelConfig.apiKeyMasked}；留空则保留原 Key</small> : null}<input type="password" value={modelKey} onChange={(event) => setModelKey(event.target.value)} placeholder={modelConfig?.source === 'custom' ? '留空保留原 Key' : '填写 API Key'} required={modelConfig?.source !== 'custom'} autoComplete="new-password" /></label>
            <div className="ai-draft-actions"><button type="submit" disabled={savingModel}>保存模型配置</button>{modelConfig?.source === 'custom' ? <button type="button" disabled={savingModel} onClick={() => void removeModel()}>删除自定义配置</button> : null}</div>
          </form> : null}
          <div className="ai-welcome"><span className="ai-large-orb"><Sparkles size={28} /></span><h1>想听什么，就告诉我。</h1><p>描述你的心情、此刻的场景，或者一段难以命名的感觉。</p></div>
          {error ? <p className="ai-error" role="alert">{error} {error.includes('登录') ? <Link to="/account">前往账号页</Link> : null}</p> : null}
          <div className="ai-messages">
            {runs.map((run) => <div key={run.id}>
              <div className="ai-message user"><span className="ai-message-avatar"><User size={18} /></span><div className="ai-bubble"><p>{run.userText}</p></div></div>
              <div className="ai-message assistant"><span className="ai-message-avatar"><Bot size={18} /></span><div className="ai-bubble">
                <AiRunProgress run={run} />
                <AiTrackResults run={run} />
                <p className="ai-answer">{run.answerText || (run.status === 'FAILED' ? '生成失败，请稍后重试。' : run.status === 'CANCELLED' ? '已停止生成。' : '正在思考并查找真实歌曲…')}</p>
                {run.status === 'COMPLETED' ? <button className="ai-regenerate" type="button" onClick={() => void regenerate(run)}>重新生成</button> : null}
                {run.wantsPlaylist && run.cards.some((card) => card.type === 'draft') ? <div className="recommendation-stack">{run.cards.filter((card) => card.type === 'draft').map((card) => card.type === 'draft' ? <div key={card.draftId}><div className="playlist-draft"><div><span className="eyebrow">PLAYLIST DRAFT</span><strong>{card.name} · {card.trackCount} 首</strong><small>确认后创建到网易云音乐</small></div><div className="ai-draft-actions"><button type="button" onClick={() => void editDraft(card.draftId)}>编辑</button><button type="button" disabled={publishing === card.draftId} onClick={() => published[card.draftId] ? navigate(`/library?playlist=${encodeURIComponent(published[card.draftId]!)}`) : void publish(card.draftId)}>{published[card.draftId] ? '查看歌单' : publishing === card.draftId ? '创建中…' : '创建歌单'}</button></div></div>
                  {editing?.id === card.draftId ? <div className="ai-draft-editor"><input aria-label="歌单名称" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} maxLength={40} />
                    {editing.tracks.map((track, position) => <div className="ai-draft-track" key={`${track.provider}:${track.sourceId}`}><span>{position + 1}. {track.name} · {track.artists[0]?.name}</span><button type="button" disabled={position === 0} onClick={() => setEditing((value) => { if (!value) return value; const tracks = [...value.tracks]; [tracks[position - 1], tracks[position]] = [tracks[position]!, tracks[position - 1]!]; return { ...value, tracks } })}>↑</button><button type="button" disabled={position === editing.tracks.length - 1} onClick={() => setEditing((value) => { if (!value) return value; const tracks = [...value.tracks]; [tracks[position], tracks[position + 1]] = [tracks[position + 1]!, tracks[position]!]; return { ...value, tracks } })}>↓</button><button type="button" onClick={() => setEditing((value) => value ? { ...value, tracks: value.tracks.filter((item) => item.sourceId !== track.sourceId) } : value)}>移除</button></div>)}
                    <div className="ai-draft-search"><input aria-label="搜索要添加的歌曲" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索歌曲后添加" /><button type="button" onClick={() => void searchForDraft()}>搜索</button></div>
                    {searchResults.map((track) => <button type="button" className="ai-draft-search-result" key={track.sourceId} onClick={() => setEditing((value) => value && !value.tracks.some((item) => item.sourceId === track.sourceId) ? { ...value, tracks: [...value.tracks, track] } : value)}>＋ {track.name} · {track.artists[0]?.name}</button>)}
                    <div className="ai-draft-actions"><button type="button" onClick={() => setEditing(null)}>取消</button><button type="button" onClick={() => void saveDraft()} disabled={!editing.name.trim()}>保存修改</button></div>
                  </div> : null}</div> : null)}</div> : null}
              </div></div>
            </div>)}
          </div>
        </div>
        <form className="ai-composer glass-panel" onSubmit={submit}><button type="button" aria-label="停止生成" onClick={() => void stop()} disabled={!busy}><StopCircle size={19} /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：找一些适合深夜写代码、不容易分心的电子乐..." rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><button className="ai-send" type="submit" disabled={!draft.trim() || busy}><Send size={18} /></button><span>推荐歌曲来自真实曲库，播放权限以当前账号为准。</span></form>
      </section>
    </div>
  )
}

function AiTrackResults({ run }: { run: AiRun }) {
  const playQueue = usePlayerStore((state) => state.playQueue)
  const tracks = run.cards.filter((card) => card.type === 'track').map((card, index) => toUiTrack(card.track, index))
  if (!tracks.length) return null
  return <section className="ai-track-results" aria-label="推荐歌曲列表">
    <header><div><strong>已核验的歌曲</strong><small>{tracks.length} 首 · 点击任意歌曲播放</small></div><button type="button" onClick={() => playQueue(tracks, 0)}>播放全部</button></header>
    <div className="ai-track-list">{tracks.map((track, index) => <TrackListItem key={`${track.provider}:${track.sourceId}`} track={track} variant="recommend" onPlay={() => playQueue(tracks, index)} />)}</div>
  </section>
}
