import Taro from '@tarojs/taro'
import type { TrackRef, PlaybackState, ChatMessage } from '@tmusic/contracts'

export type Playlist = { id: string; name: string; description: string; trackCount: number; durationText: string; coverUrl: string | null; subscribed?: boolean }
export type Album = { id: string; name: string; artistName: string; coverUrl: string | null; size: number }
export type Artist = { id: string; name: string; coverUrl: string | null; musicCount: number; albumCount: number }
export type LibraryKind = 'playlist' | 'liked' | 'album' | 'artist'
export type HomeData = { hero: TrackRef; guessYouLike: TrackRef[]; quickPicks: TrackRef[]; recommendations: TrackRef[]; playlists: Playlist[]; degraded: boolean }
export type Account = { authenticated: boolean; profile: { nickname?: string; avatarUrl?: string; signature?: string; follows?: number; followeds?: number; playlistCount?: number } | null; level?: number; listenSongs?: number }
export type Room = { room: { id: string; name: string; role: 'HOST' | 'MEMBER'; ownerId: string }; playback: PlaybackState; queue: TrackRef[]; members: Array<{ userId: string; name: string }>; messages: ChatMessage[]; realtimeTicket: string }

const actorKey = 'tmusic:anonymous-actor-id'
export function actorId() {
  let id = Taro.getStorageSync(actorKey) as string
  if (!id) { id = `mini-${Date.now()}-${Math.random().toString(36).slice(2)}`; Taro.setStorageSync(actorKey, id) }
  return id
}

export async function api<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: unknown): Promise<T> {
  const cookie = Taro.getStorageSync('tmusic:room-cookie') as string
  const response = await Taro.request<{ data?: T; error?: { message: string } }>({
    url: `${__API_URL__}${path}`,
    method,
    data,
    header: { 'x-user-id': actorId(), ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
  })
  const setCookie = response.header?.['Set-Cookie'] || response.header?.['set-cookie']
  if (setCookie) Taro.setStorageSync('tmusic:room-cookie', String(setCookie).split(';')[0])
  if (response.statusCode === 204) return undefined as T
  if (response.statusCode < 200 || response.statusCode >= 300 || response.data?.data === undefined) {
    throw new Error(response.data?.error?.message || `请求失败 (${response.statusCode})`)
  }
  return response.data.data
}

export const catalogHome = () => api<HomeData>('/catalog/home')
export const search = (q: string, type: 'song' | 'playlist' | 'artist' | 'album' = 'song') => api<{ items: Array<TrackRef | Playlist | Artist | Album>; degraded: boolean }>(`/catalog/search?q=${encodeURIComponent(q)}&type=${type}&limit=30`)
export const library = (type: LibraryKind) => api<{ items: Array<TrackRef | Playlist | Artist | Album> }>(`/me/library?type=${type}`)
export const playlistTracks = (id: string) => api<{ playlist: Playlist; tracks: TrackRef[] }>(`/me/playlists/${encodeURIComponent(id)}/tracks`)
export const createPlaylist = (name: string) => api<{ id: string }>('/me/playlists', 'POST', { name })
export const addToPlaylist = (id: string, sourceId: string) => api(`/me/playlists/${encodeURIComponent(id)}/tracks`, 'POST', { sourceId })
export const setLiked = (sourceId: string, liked: boolean) => api(`/me/liked/${encodeURIComponent(sourceId)}`, 'PUT', { liked })
export const accountStatus = () => api<Account>('/auth/netease/status')
export const accountOverview = () => api<{ likedCount: number | null }>('/me/overview')
export const sendLoginCaptcha = (phone: string) => api<{ sent: boolean; retryAfterSeconds: number }>('/auth/netease/phone/captcha', 'POST', { phone })
export const loginWithPhone = (phone: string, captcha: string) => api<{ authenticated: boolean }>('/auth/netease/phone/login', 'POST', { phone, captcha })
export const disconnect = () => api('/auth/netease/session', 'DELETE')
export const resolve = (track: TrackRef) => api<{ url: string }>('/playback/resolve', 'POST', { track: { provider: track.provider, sourceId: track.sourceId }, quality: 'exhigh' })
export const lyrics = (sourceId: string) => api<{ original: string; translation: string }>(`/playback/lyrics/${encodeURIComponent(sourceId)}`)
export const ensureRoomSession = () => api('/rooms/session', 'POST', {})
export const createRoom = async (initialQueue: TrackRef[]) => { await ensureRoomSession(); return api<{ id: string; inviteCode: string; shareUrl: string }>('/rooms', 'POST', { initialQueue }) }
export const joinRoom = async (id: string, code: string) => { await ensureRoomSession(); return api<Room>(`/rooms/${encodeURIComponent(id)}/join`, 'POST', { code }) }
export const roomSnapshot = (id: string) => api<Room>(`/rooms/${encodeURIComponent(id)}/snapshot`)
export const leaveRoom = (id: string) => api(`/rooms/${encodeURIComponent(id)}/leave`, 'POST', {})
