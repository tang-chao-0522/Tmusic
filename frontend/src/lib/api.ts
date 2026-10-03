import type { TrackRef } from '@tmusic/contracts'
import { demoTracks, type DemoTrack } from '../data/tracks'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

type UiComment = { id: string; user: string; text: string; time: string; likes: number }

async function requestEnvelope<T>(path: string, init?: RequestInit): Promise<{ data: T; meta: Record<string, unknown> }> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-user-id': 'dev-user', ...init?.headers },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed: ${response.status}`)
  return payload as { data: T; meta: Record<string, unknown> }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestEnvelope<T>(path, init)).data
}

const palettes: Array<[string, string]> = [
  ['#dca7c9', '#766f9d'], ['#363c68', '#e18b9e'], ['#172749', '#7383b4'],
  ['#bd829c', '#513d6b'], ['#c89596', '#27345b'], ['#29234c', '#9a71aa'],
]

export type CatalogHome = {
  hero: TrackRef
  continueListening: TrackRef[]
  quickPicks: TrackRef[]
  recommendations: TrackRef[]
  playlists: PlaylistSummary[]
  degraded: boolean
  message?: string
}

export type PlaylistSummary = {
  id: string
  name: string
  description: string
  trackCount: number
  durationText: string
  coverUrl: string | null
}

export function toUiTrack(track: TrackRef, index = 0): DemoTrack {
  const fallback = demoTracks[index % demoTracks.length]
  return {
    ...track,
    id: `${track.provider}:${track.sourceId}`,
    mood: fallback?.mood ?? '氛围',
    liked: true,
    palette: palettes[index % palettes.length] ?? ['#dca7c9', '#766f9d'],
  }
}

export async function getCatalogHome() {
  const data = await request<CatalogHome>('/catalog/home')
  return {
    ...data,
    hero: toUiTrack(data.hero, 0),
    continueListening: data.continueListening.map(toUiTrack),
    quickPicks: data.quickPicks.map(toUiTrack),
    recommendations: data.recommendations.map(toUiTrack),
  }
}

export async function searchCatalog(query: string, offset = 0, limit = 30) {
  const { data, meta } = await requestEnvelope<{ tracks: TrackRef[]; degraded: boolean }>(`/catalog/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`)
  return {
    ...data,
    tracks: data.tracks.map((track, index) => toUiTrack(track, offset + index)),
    total: Number(meta.total ?? 0),
    hasMore: Boolean(meta.hasMore),
    nextOffset: meta.nextCursor === null || meta.nextCursor === undefined ? null : Number(meta.nextCursor),
  }
}

export function getPlaylists() {
  return request<{ featured: PlaylistSummary; items: PlaylistSummary[]; degraded: boolean }>('/me/playlists')
}

export type PlaybackGrant = {
  url: string
  expiresAt: string | null
  quality: string
  bitrate: number | null
  codec: string | null
  source: 'netease'
  availability: 'AVAILABLE'
}

export function resolvePlayback(track: DemoTrack, quality = 'exhigh') {
  return request<PlaybackGrant>('/playback/resolve', {
    method: 'POST',
    body: JSON.stringify({ track: { provider: track.provider, sourceId: track.sourceId }, quality }),
  })
}

export function createNeteaseQr() {
  return request<{ key: string; qrUrl: string | null; qrImage: string }>('/auth/netease/qr', { method: 'POST', body: '{}' })
}

export function checkNeteaseQr(key: string) {
  return request<{ code: number; message: string; authenticated: boolean }>(`/auth/netease/qr/status?key=${encodeURIComponent(key)}`)
}

export function getNeteaseLoginStatus() {
  return request<{ authenticated: boolean; account: { id?: number } | null; profile: { nickname?: string; avatarUrl?: string; userId?: number } | null; credentialStored?: boolean }>('/auth/netease/status')
}

export function disconnectNetease() {
  return request<{ authenticated: false }>('/auth/netease/session', { method: 'DELETE' })
}

export async function getTmusicComments(provider: string, sourceId: string): Promise<UiComment[]> {
  const data = await request<Array<Record<string, any>>>(`/comments?targetType=TRACK&provider=${encodeURIComponent(provider)}&targetId=${encodeURIComponent(sourceId)}`)
  return data.map((item) => ({ id: String(item.publicId ?? item.id), user: String(item.authorName ?? item.author?.displayName ?? 'TMusic 用户'), text: String(item.content), time: item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '刚刚', likes: Number(item.likeCount ?? 0) }))
}

export async function getNeteaseComments(provider: string, sourceId: string): Promise<UiComment[]> {
  const data = await request<Array<Record<string, any>>>(`/catalog/tracks/${encodeURIComponent(provider)}/${encodeURIComponent(sourceId)}/comments`)
  return data.map((item) => ({ id: String(item.id), user: String(item.author?.displayName ?? '网易云用户'), text: String(item.content), time: new Date(item.createdAt).toLocaleDateString('zh-CN'), likes: Number(item.likeCount ?? 0) }))
}

export function postTmusicComment(provider: string, sourceId: string, content: string) {
  return request('/comments', { method: 'POST', body: JSON.stringify({ target: { type: 'TRACK', provider, sourceId }, content, parentId: null }) })
}
