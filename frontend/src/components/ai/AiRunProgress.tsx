import { Circle, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import type { AiRun } from '../../lib/api'

function StateIcon({ state }: { state: string }) {
  if (state === 'DONE' || state === 'SUCCEEDED' || state === 'COMPLETED') return <CircleCheck className="ai-progress-done" size={16} />
  if (state === 'FAILED' || state === 'BLOCKED' || state === 'CANCELLED') return <CircleX className="ai-progress-fail" size={16} />
  if (state === 'RUNNING' || state === 'IN_PROGRESS' || state === 'QUEUED') return <LoaderCircle className="ai-progress-loading" size={16} />
  return <Circle className="ai-progress-pending" size={16} />
}

const toolNames: Record<string, string> = {
  search_tracks: '搜索候选歌曲', verify_tracks: '核验歌曲', get_track_detail: '核验歌曲详情', create_playlist_draft: '创建歌单草稿',
}

export function AiRunProgress({ run }: { run: AiRun }) {
  const tracks = run.cards.filter((card) => card.type === 'track').length
  const running = run.status === 'QUEUED' || run.status === 'RUNNING'
  const headline = run.status === 'COMPLETED' ? '任务完成' : run.status === 'FAILED' ? '任务未完成' : run.status === 'CANCELLED' ? '已停止' : '正在处理'
  return <section className="ai-progress" aria-label="任务进度" aria-live="polite">
    <header><StateIcon state={run.status} /><strong>{headline}</strong>{run.requestedTrackCount > 0 ? <span>已核验 {tracks}/{run.requestedTrackCount} 首</span> : null}</header>
    {run.plan ? <ol>{run.plan.todos.map((todo) => {
      const state = run.status === 'FAILED' && todo.status !== 'DONE' ? 'FAILED' : todo.status
      const steps = run.steps.filter((step) => step.todoId === todo.id)
      return <li key={todo.id}><div className="ai-progress-todo"><StateIcon state={state} /><span>{todo.title}</span></div>{steps.length ? <ul>{steps.map((step) => {
        const stepState = step.status === 'RUNNING' && !running ? 'FAILED' : step.status
        return <li key={step.id}><StateIcon state={stepState} /><span>{toolNames[step.name] ?? step.name}</span><small>{stepState === 'SUCCEEDED' ? '完成' : stepState === 'FAILED' ? '失败' : '执行中'}</small></li>
      })}</ul> : null}</li>
    })}</ol> : running ? <p>正在分析需求并制定计划…</p> : null}
  </section>
}
