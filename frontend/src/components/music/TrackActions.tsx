import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, ListPlus, Music2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DemoTrack } from '../../data/tracks'
import { addTrackToPlaylist, setTrackLiked, type PlaylistSummary } from '../../lib/api'
import { queries, queryKeys } from '../../lib/queries'

export function TrackActions({ track }: { track: DemoTrack }) {
  const client = useQueryClient()
  const account = useQuery(queries.accountStatus())
  const userId = Number(account.data?.account?.id ?? 0)
  const authenticated = Boolean(account.data?.authenticated)
  const liked = useQuery({ ...queries.likedIds(userId), enabled: authenticated })
  const [open, setOpen] = useState(false)
  const playlists = useQuery({ ...queries.library(userId, 'playlist'), enabled: authenticated && open })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const isLiked = liked.data?.ids.includes(track.sourceId) ?? false
  const own = (playlists.data?.items ?? []).filter((item): item is PlaylistSummary => 'trackCount' in item && !item.subscribed)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy])

  async function toggleLiked() {
    if (busy || !authenticated || !liked.data || !/^\d+$/.test(track.sourceId)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await setTrackLiked(track.sourceId, !isLiked)
      client.setQueryData(queryKeys.likedIds(userId), { ids: isLiked ? (liked.data?.ids ?? []).filter((id) => id !== track.sourceId) : [...(liked.data?.ids ?? []), track.sourceId] })
      await Promise.all([client.invalidateQueries({ queryKey: queryKeys.likedTracks(userId) }), client.invalidateQueries({ queryKey: queryKeys.library(userId, 'liked') }), client.invalidateQueries({ queryKey: queryKeys.accountOverview(userId) })])
    } catch (cause) { setError(cause instanceof Error ? cause.message : '收藏操作失败') }
    finally { setBusy(false) }
  }

  async function add(playlistId: string) {
    if (busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await addTrackToPlaylist(playlistId, track.sourceId)
      await Promise.all([client.invalidateQueries({ queryKey: queryKeys.library(userId, 'playlist') }), client.invalidateQueries({ queryKey: queryKeys.playlistTracks(userId, playlistId) })])
      setSuccess('已加入歌单'); setOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '加入歌单失败') }
    finally { setBusy(false) }
  }

  return <div className="track-actions" onClick={(event) => event.stopPropagation()}>
    <button type="button" className={isLiked ? 'is-liked' : ''} aria-label={isLiked ? `取消喜欢 ${track.name}` : `喜欢 ${track.name}`} title={liked.isError ? liked.error.message : authenticated ? undefined : '请先连接网易云音乐'} disabled={!authenticated || busy || !liked.data || !/^\d+$/.test(track.sourceId)} onClick={() => void toggleLiked()}><Heart size={17} fill={isLiked ? 'currentColor' : 'none'} /></button>
    <button type="button" aria-label={`将 ${track.name} 加入歌单`} title={authenticated ? undefined : '请先连接网易云音乐'} disabled={!authenticated || busy || !/^\d+$/.test(track.sourceId)} onClick={() => { setOpen(!open); setError(''); setSuccess('') }}><ListPlus size={18} /></button>
    {open ? createPortal(<div className="track-playlist-backdrop" onClick={(event) => { event.stopPropagation(); if (!busy) setOpen(false) }}>
      <section className="track-playlist-dialog glass-panel" role="dialog" aria-modal="true" aria-label={`将 ${track.name} 加入歌单`} onClick={(event) => event.stopPropagation()}>
        <header><span className="eyebrow">MY PLAYLISTS</span><button type="button" aria-label="关闭" disabled={busy} onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="track-playlist-heading"><span className="track-playlist-icon"><ListPlus size={24} /></span><div><h2>加入歌单</h2><p>将「{track.name}」保存到我创建的歌单</p></div></div>
        <div className="track-playlist-options">
          {playlists.isPending ? <p>正在读取歌单…</p> : playlists.isError ? <p role="alert">{playlists.error.message}</p> : own.length ? own.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void add(item.id)}><span className="track-playlist-cover">{item.coverUrl ? <img src={item.coverUrl} alt="" /> : <Music2 size={21} />}</span><span><strong>{item.name}</strong><small>{item.trackCount} 首歌曲</small></span><ListPlus size={18} /></button>) : <p>还没有创建的歌单，可前往音乐库创建。</p>}
        </div>
        {error ? <p className="track-playlist-error" role="alert">{error}</p> : null}
        <footer><button type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button></footer>
      </section>
    </div>, document.body) : null}
    {!open && error ? <span className="track-action-feedback" role="alert">{error}</span> : null}
    {success ? <span className="track-action-feedback" role="status">{success}</span> : null}
  </div>
}
