import type { ChatMessage, PlaybackState, TrackRef } from '@tmusic/contracts'
import { demoTracks, type DemoTrack } from '../data/tracks'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
const ACTOR_STORAGE_KEY = 'tmusic:anonymous-actor-id'

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

export function realtimeOrigin() {
  return import.meta.env.VITE_REALTIME_URL || new URL(API_URL, window.location.origin).origin
}

function browserActorId() {
  let actorId = localStorage.getItem(ACTOR_STORAGE_KEY)
  if (!actorId) {
    actorId = `browser-${crypto.randomUUID()}`
    localStorage.setItem(ACTOR_STORAGE_KEY, actorId)
  }
  return actorId
}

type UiComment = { id: string; user: string; text: string; time: string; likes: number }

let aiSessionRenewal: Promise<void> | null = null

async function requestEnvelope<T>(path: string, init?: RequestInit, renewed = false): Promise<{ data: T; meta: Record<string, unknown> }> {
  const headers = new Headers(init?.headers)
  headers.set('x-user-id', browserActorId())
  if (typeof init?.body === 'string' && init.body.length > 0) {
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  } else {
    headers.delete('content-type')
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok && path.startsWith('/ai/') && payload?.error?.code === 'AI_LOGIN_REQUIRED' && !renewed) {
    aiSessionRenewal ??= request<{ authenticated: true }>('/auth/netease/ai-session', { method: 'POST' }).then(() => undefined).finally(() => { aiSessionRenewal = null })
    try { await aiSessionRenewal }
    catch (cause) {
      if (cause instanceof ApiError && (cause.code === 'NETEASE_LOGIN_REQUIRED' || cause.code === 'NETEASE_LOGIN_EXPIRED')) throw new ApiError('AI_LOGIN_REQUIRED', '请先登录网易云账号，再使用音乐助手。')
      throw cause
    }
    try { return await requestEnvelope<T>(path, init, true) }
    catch (cause) {
      if (cause instanceof ApiError && cause.code === 'AI_LOGIN_REQUIRED') throw new ApiError('AI_SESSION_COOKIE_UNAVAILABLE', '网易云账号已验证，但 AI 会话 Cookie 未生效；请检查 HTTPS 和浏览器 Cookie 设置。')
      throw cause
    }
  }
  if (!response.ok) throw new ApiError(payload?.error?.code || 'REQUEST_FAILED', payload?.error?.message || `Request failed: ${response.status}`)
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
  guessYouLike: TrackRef[]
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
  creatorName?: string
  subscribed?: boolean
}

export type AlbumSummary = { id: string; name: string; artistName: string; coverUrl: string | null; publishTime: string | null; size: number }
export type ArtistSummary = { id: string; name: string; coverUrl: string | null; albumCount: number; musicCount: number; followed?: boolean }
export type SearchType = 'song' | 'playlist' | 'artist' | 'album'
export type LibraryType = 'playlist' | 'liked' | 'album' | 'artist'
export type CatalogItem = TrackRef | PlaylistSummary | AlbumSummary | ArtistSummary

export type RoomMember = { userId: string; name: string; connections: number; lastSeen: number; ready: boolean }
export type RoomSnapshot = {
  room: { id: string; name: string; status: 'ACTIVE' | 'ENDED'; role: 'HOST' | 'MEMBER'; ownerId: string; maxMembers: number }
  playback: PlaybackState
  queue: TrackRef[]
  members: RoomMember[]
  messages: ChatMessage[]
  realtimeTicket: string
}

export function ensureRoomSession() {
  return request<{ userId: string; name: string }>('/rooms/session', { method: 'POST', body: '{}' })
}

export function createRoom(input: { initialQueue: TrackRef[] }) {
  return request<{ id: string; inviteCode: string; shareUrl: string }>('/rooms', { method: 'POST', body: JSON.stringify(input) })
}

export function getRoomSnapshot(roomId: string, code?: string) {
  return request<RoomSnapshot>(`/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: JSON.stringify({ code }) })
}

export function refreshRoomSnapshot(roomId: string) {
  return request<RoomSnapshot>(`/rooms/${encodeURIComponent(roomId)}/snapshot`)
}

export function leaveRoom(roomId: string) {
  return request(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST', body: '{}' })
}

export function endRoom(roomId: string) {
  return request(`/rooms/${encodeURIComponent(roomId)}/end`, { method: 'POST', body: '{}' })
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

export async function getCatalogHome(signal?: AbortSignal) {
  const data = await request<CatalogHome>('/catalog/home', { signal })
  return {
    ...data,
    hero: toUiTrack(data.hero, 0),
    guessYouLike: data.guessYouLike.map(toUiTrack),
    quickPicks: data.quickPicks.map(toUiTrack),
    recommendations: data.recommendations.map(toUiTrack),
  }
}

export async function searchCatalog(query: string, type: SearchType = 'song', offset = 0, limit = 30, signal?: AbortSignal) {
  const { data, meta } = await requestEnvelope<{ type: SearchType; items: CatalogItem[]; degraded: boolean }>(`/catalog/search?q=${encodeURIComponent(query)}&type=${type}&offset=${offset}&limit=${limit}`, { signal })
  return {
    ...data,
    items: type === 'song' ? (data.items as TrackRef[]).map((track, index) => toUiTrack(track, offset + index)) : data.items,
    total: Number(meta.total ?? 0),
    hasMore: Boolean(meta.hasMore),
    nextOffset: meta.nextCursor === null || meta.nextCursor === undefined ? null : Number(meta.nextCursor),
  }
}

export async function getNeteaseLibrary(type: LibraryType, signal?: AbortSignal) {
  const data = await request<{ type: LibraryType; items: CatalogItem[] }>(`/me/library?type=${type}`, { signal })
  return {
    ...data,
    items: type === 'liked' ? (data.items as TrackRef[]).map(toUiTrack) : data.items,
  }
}

export async function getLikedTracksPage(offset = 0, limit = 40, signal?: AbortSignal) {
  const { data, meta } = await requestEnvelope<{ type: 'liked'; items: TrackRef[] }>(`/me/library?type=liked&offset=${offset}&limit=${limit}`, { signal })
  return {
    items: data.items.map((track, index) => toUiTrack(track, offset + index)),
    total: Number(meta.total ?? 0),
    nextOffset: meta.nextCursor === null || meta.nextCursor === undefined ? null : Number(meta.nextCursor),
  }
}

export function getPlaylists(signal?: AbortSignal) {
  return request<{ featured: PlaylistSummary; items: PlaylistSummary[]; degraded: boolean }>('/me/playlists', { signal })
}

export function getLikedIds(signal?: AbortSignal) {
  return request<{ ids: string[] }>('/me/liked-ids', { signal })
}

export function setTrackLiked(sourceId: string, liked: boolean) {
  return request<{ sourceId: string; liked: boolean }>(`/me/liked/${encodeURIComponent(sourceId)}`, { method: 'PUT', body: JSON.stringify({ liked }) })
}

export function createNeteasePlaylist(name: string) {
  return request<{ id: string }>('/me/playlists', { method: 'POST', body: JSON.stringify({ name }) })
}

export function addTrackToPlaylist(playlistId: string, sourceId: string) {
  return request<{ playlistId: string; sourceId: string }>(`/me/playlists/${encodeURIComponent(playlistId)}/tracks`, { method: 'POST', body: JSON.stringify({ sourceId }) })
}

export async function getPlaylistTracks(playlistId: string, signal?: AbortSignal) {
  const data = await request<{ playlist: PlaylistSummary; tracks: TrackRef[] }>(`/me/playlists/${encodeURIComponent(playlistId)}/tracks`, { signal })
  return { ...data, tracks: data.tracks.map(toUiTrack) }
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

export function resolvePlayback(track: DemoTrack, quality = 'exhigh', signal?: AbortSignal) {
  return request<PlaybackGrant>('/playback/resolve', {
    method: 'POST',
    body: JSON.stringify({ track: { provider: track.provider, sourceId: track.sourceId }, quality }),
    signal,
  })
}

export function getTrackLyrics(sourceId: string, signal?: AbortSignal) {
  return request<{ original: string; translation: string }>(`/playback/lyrics/${encodeURIComponent(sourceId)}`, { signal })
}

export function createNeteaseQr() {
  return request<{ key: string; qrUrl: string | null; qrImage: string }>('/auth/netease/qr', { method: 'POST', body: '{}' })
}

export function checkNeteaseQr(key: string) {
  return request<{ code: number; message: string; authenticated: boolean }>(`/auth/netease/qr/status?key=${encodeURIComponent(key)}`)
}

export function getNeteaseLoginStatus(signal?: AbortSignal) {
  return request<{ authenticated: boolean; account: { id?: number; vipType?: number } | null; profile: { nickname?: string; avatarUrl?: string; userId?: number; signature?: string; follows?: number; followeds?: number; playlistCount?: number; createTime?: number; city?: number; province?: number; vipType?: number } | null; level?: number | null; listenSongs?: number | null; createDays?: number | null; credentialStored?: boolean; needsReconnect?: boolean }>('/auth/netease/status', { cache: 'no-store', signal })
}

export type AccountOverview = {
  artists: ArtistSummary[] | null
  likedCount: number | null
}

export function getAccountOverview(signal?: AbortSignal) {
  return request<AccountOverview>('/me/overview', { signal })
}

export type RecentTrack = { track: TrackRef; playedAt: number | null }

export function getRecentTracks(offset = 0, limit = 30, signal?: AbortSignal) {
  return request<{ items: RecentTrack[]; total: number; hasMore: boolean; nextOffset: number | null }>(`/me/recent-tracks?offset=${offset}&limit=${limit}`, { signal })
}

export function disconnectNetease() {
  return request<{ authenticated: false }>('/auth/netease/session', { method: 'DELETE' })
}

export type AiPlan = { version: number; goal: string; constraints: string[]; assumptions: string[]; missingInformation: string[]; proposedApproach: string; status: string; todos: Array<{ id: string; title: string; acceptance: string; dependsOn: string[]; status: string; evidence: string[] }> }
export type AiCard = { type: 'track'; track: TrackRef } | { type: 'draft'; draftId: string; name: string; trackCount: number }
export type AiRun = { id: string; messageId: string; conversationId: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; userText: string; requestedTrackCount: number; wantsPlaylist: boolean; answerText: string; cards: AiCard[]; plan: AiPlan | null; steps: Array<{ id: string; name: string; status: string; todoId?: string | null }>; errorCode?: string; latestSequence: number; createdAt: string }
export type AiConversation = { id: string; title: string; updatedAt?: string }
export type AiCustomProvider = 'openai-compatible' | 'anthropic-compatible'
export type AiModelConfig = { source: 'default'; provider: string; model: string; configured: boolean } | { source: 'custom'; provider: AiCustomProvider; baseUrl: string; model: string; apiKeyMasked: string }

export function getAiModelConfig() { return request<AiModelConfig>('/ai/model-config') }
export function saveAiModelConfig(value: { provider: AiCustomProvider; baseUrl: string; model: string; apiKey?: string }) {
  return request<AiModelConfig>('/ai/model-config', { method: 'PUT', body: JSON.stringify(value) })
}
export function deleteAiModelConfig() { return request<AiModelConfig>('/ai/model-config', { method: 'DELETE' }) }

export function listAiConversations() { return request<AiConversation[]>('/ai/conversations') }
export function createAiConversation() { return request<AiConversation>('/ai/conversations', { method: 'POST', body: '{}' }) }
export function getAiConversation(id: string) { return request<{ id: string; title: string; runs: AiRun[] }>(`/ai/conversations/${encodeURIComponent(id)}`) }
export function sendAiMessage(id: string, text: string, clientMessageId: string = crypto.randomUUID()) {
  return request<{ messageId: string; runId: string; status: AiRun['status']; eventsUrl: string }>(`/ai/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ clientMessageId, content: [{ type: 'text', text }] }) })
}
export function getAiRun(id: string) { return request<AiRun>(`/ai/runs/${encodeURIComponent(id)}`) }
export function regenerateAiMessage(messageId: string) { return request<{ conversationId: string; runId: string; messageId: string; eventsUrl: string }>(`/ai/messages/${encodeURIComponent(messageId)}/regenerate`, { method: 'POST', body: '{}' }) }
export function cancelAiRun(id: string) { return request<AiRun>(`/ai/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }) }
export function getAiDraft(id: string) { return request<{ id: string; name: string; tracks: TrackRef[]; version: number; status: string; publishedPlaylistId?: string }>(`/ai/playlist-drafts/${encodeURIComponent(id)}`) }
export function updateAiDraft(id: string, name: string, sourceIds: string[], expectedVersion: number) {
  return request<{ id: string; name: string; tracks: TrackRef[]; version: number; status: string }>(`/ai/playlist-drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name, sourceIds, expectedVersion }) })
}
export function publishAiDraft(id: string, expectedVersion: number) {
  return request<{ id: string; status: string; publishedPlaylistId?: string }>(`/ai/playlist-drafts/${encodeURIComponent(id)}/publish`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ expectedVersion }) })
}
export function aiEventsUrl(runId: string, after = 0) { return `${API_URL}/ai/runs/${encodeURIComponent(runId)}/events?after=${after}` }

export async function getTmusicComments(provider: string, sourceId: string, signal?: AbortSignal): Promise<UiComment[]> {
  const data = await request<Array<Record<string, any>>>(`/comments?targetType=TRACK&provider=${encodeURIComponent(provider)}&targetId=${encodeURIComponent(sourceId)}`, { signal })
  return data.map((item) => ({ id: String(item.publicId ?? item.id), user: String(item.authorName ?? item.author?.displayName ?? 'TMusic 用户'), text: String(item.content), time: item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '刚刚', likes: Number(item.likeCount ?? 0) }))
}

export async function getNeteaseComments(provider: string, sourceId: string, signal?: AbortSignal): Promise<UiComment[]> {
  const data = await request<Array<Record<string, any>>>(`/catalog/tracks/${encodeURIComponent(provider)}/${encodeURIComponent(sourceId)}/comments`, { signal })
  return data.map((item) => ({ id: String(item.id), user: String(item.author?.displayName ?? '网易云用户'), text: String(item.content), time: new Date(item.createdAt).toLocaleDateString('zh-CN'), likes: Number(item.likeCount ?? 0) }))
}

export function postTmusicComment(provider: string, sourceId: string, content: string) {
  return request('/comments', { method: 'POST', body: JSON.stringify({ target: { type: 'TRACK', provider, sourceId }, content, parentId: null }) })
}
