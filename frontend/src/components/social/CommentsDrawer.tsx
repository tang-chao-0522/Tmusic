import { Heart, MessageCircle, Send, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DemoTrack } from '../../data/tracks'
import { getNeteaseComments, getTmusicComments, postTmusicComment } from '../../lib/api'

const tmusicComments = [
  { id: '1', user: '晚风邮差', text: '前奏响起的时候，像重新走过了一遍那条回家的路。', time: '12 分钟前', likes: 18 },
  { id: '2', user: '星球漫游', text: '耳机里是春天，窗外也是。', time: '昨天', likes: 9 },
]

const neteaseComments = [
  { id: 'n1', user: '海边的猫', text: '在网易云收藏了很多年，今天还是会被打动。', time: '2025-04-12', likes: 324 },
  { id: 'n2', user: '凌晨三点', text: '愿每个听到这首歌的人，都能等到自己的黎明。', time: '2024-11-03', likes: 217 },
]

export function CommentsDrawer({ track, onClose }: { track: DemoTrack | null; onClose: () => void }) {
  const [source, setSource] = useState<'tmusic' | 'netease'>('tmusic')
  const [draft, setDraft] = useState('')
  if (!track) return null
  return <CommentsDrawerContent track={track} source={source} setSource={setSource} draft={draft} setDraft={setDraft} onClose={onClose} />
}

function CommentsDrawerContent({ track, source, setSource, draft, setDraft, onClose }: { track: DemoTrack; source: 'tmusic' | 'netease'; setSource: (value: 'tmusic' | 'netease') => void; draft: string; setDraft: (value: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['comments', source, track.provider, track.sourceId],
    queryFn: () => source === 'tmusic' ? getTmusicComments(track.provider, track.sourceId) : getNeteaseComments(track.provider, track.sourceId),
  })
  const mutation = useMutation({
    mutationFn: (content: string) => postTmusicComment(track.provider, track.sourceId, content),
    onSuccess: () => { setDraft(''); void queryClient.invalidateQueries({ queryKey: ['comments', 'tmusic', track.provider, track.sourceId] }) },
  })
  const fallback = source === 'tmusic' ? tmusicComments : neteaseComments
  const comments = query.data?.length ? query.data : fallback

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="comments-drawer glass-panel" aria-label={`${track.name}的评论`}>
        <div className="drawer-header">
          <div><span className="eyebrow">COMMENTS</span><h2>{track.name}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>
        <div className="comment-source-tabs">
          <button type="button" className={source === 'tmusic' ? 'active' : ''} onClick={() => setSource('tmusic')}>TMusic 评论</button>
          <button type="button" className={source === 'netease' ? 'active' : ''} onClick={() => setSource('netease')}>网易云评论</button>
        </div>
        {source === 'netease' ? <p className="source-note">来自网易云 · 只读展示</p> : null}
        <div className="comment-list">
          {comments.map((comment) => (
            <article key={comment.id} className="comment-item">
              <span className="comment-avatar">{comment.user.slice(0, 1)}</span>
              <div><strong>{comment.user}</strong><p>{comment.text}</p><span>{comment.time}</span></div>
              <button type="button"><Heart size={14} /> {comment.likes}</button>
            </article>
          ))}
        </div>
        {source === 'tmusic' ? (
          <div className="comment-composer">
            <MessageCircle size={18} />
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写下你的感受..." maxLength={500} />
            <button type="button" disabled={!draft.trim() || mutation.isPending} onClick={() => mutation.mutate(draft.trim())}><Send size={17} /></button>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
