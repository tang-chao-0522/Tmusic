import { env } from '../config/env'
import type { ExternalComment, MusicProvider, PlaybackGrant, ProviderContext } from './musicProvider'
import type { TrackRef } from '@tmusic/contracts'

type NeteaseUrlItem = { id?: number; url?: string | null; br?: number; type?: string; level?: string; freeTrialInfo?: unknown; fee?: number }

export class NeteaseProvider implements MusicProvider {
  private readonly baseUrl = env.NETEASE_API_URL.replace(/\/$/, '')

  private headers(context?: ProviderContext): Record<string, string> {
    const serializedCookie = context?.serializedCookie || env.NETEASE_COOKIE
    const headers: Record<string, string> = { accept: 'application/json' }
    if (serializedCookie) headers.cookie = serializedCookie
    return headers
  }

  private async json<T>(path: string, context?: ProviderContext): Promise<T> {
    const separator = path.includes('?') ? '&' : '?'
    const response = await fetch(`${this.baseUrl}${path}${separator}timestamp=${Date.now()}`, {
      headers: this.headers(context), signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Netease provider returned HTTP ${response.status}`)
    return response.json() as Promise<T>
  }

  async health() {
    const payload = await this.json<{ data?: { code?: number }; code?: number }>('/login/status')
    return { reachable: true, upstreamCode: payload.data?.code ?? payload.code ?? null }
  }

  async createQrLogin() {
    const keyPayload = await this.json<{ data?: { unikey?: string }; code?: number }>('/login/qr/key')
    const key = keyPayload.data?.unikey
    if (!key) throw new Error('Netease QR key was not returned')
    const qrPayload = await this.json<{ data?: { qrurl?: string; qrimg?: string }; code?: number }>(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`)
    if (!qrPayload.data?.qrimg) throw new Error('Netease QR image was not returned')
    return { key, qrUrl: qrPayload.data.qrurl ?? null, qrImage: qrPayload.data.qrimg }
  }

  async checkQrLogin(key: string) {
    return this.json<{ code: number; message?: string; cookie?: string }>(`/login/qr/check?key=${encodeURIComponent(key)}`)
  }

  async loginStatus(serializedCookie?: string) {
    return this.json<Record<string, any>>('/login/status', { userId: '', serializedCookie })
  }

  async logout(serializedCookie?: string) {
    return this.json<Record<string, any>>('/logout', { userId: '', serializedCookie })
  }

  async resolvePlayback(sourceId: string, quality: string, context: ProviderContext): Promise<PlaybackGrant> {
    const level = ['standard', 'exhigh', 'lossless', 'hires'].includes(quality) ? quality : 'exhigh'
    const primary = `${this.baseUrl}/song/url/v1?id=${encodeURIComponent(sourceId)}&level=${level}&timestamp=${Date.now()}`
    let response = await fetch(primary, { headers: this.headers(context), signal: AbortSignal.timeout(8_000) })

    if (!response.ok && response.status >= 500) {
      const bitrate = level === 'standard' ? 128000 : level === 'exhigh' ? 320000 : 999000
      response = await fetch(`${this.baseUrl}/song/url?id=${encodeURIComponent(sourceId)}&br=${bitrate}&timestamp=${Date.now()}`, {
        headers: this.headers(context), signal: AbortSignal.timeout(8_000),
      })
    }

    if (!response.ok) throw new Error(`Netease provider returned HTTP ${response.status}`)
    const payload = (await response.json()) as { data?: NeteaseUrlItem[] }
    const item = payload.data?.find((candidate) => String(candidate.id) === sourceId) ?? payload.data?.[0]

    if (!item?.url || item.freeTrialInfo) {
      return { url: '', expiresAt: null, quality: item?.level ?? level, bitrate: item?.br ?? null, codec: item?.type ?? null, source: 'netease', availability: item?.fee === 1 ? 'VIP_REQUIRED' : context.serializedCookie || env.NETEASE_COOKIE ? 'UNAVAILABLE' : 'LOGIN_REQUIRED' }
    }

    return { url: item.url, expiresAt: this.inferExpiry(item.url), quality: item.level ?? level, bitrate: item.br ?? null, codec: item.type ?? null, source: 'netease', availability: 'AVAILABLE' }
  }

  async getComments(kind: 'track' | 'playlist', sourceId: string, cursor?: string) {
    const endpoint = kind === 'track' ? 'music' : 'playlist'
    const before = cursor ? `&before=${encodeURIComponent(cursor)}` : ''
    const response = await fetch(`${this.baseUrl}/comment/${endpoint}?id=${encodeURIComponent(sourceId)}&limit=20${before}&timestamp=${Date.now()}`, {
      headers: this.headers(), signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`Netease comments returned HTTP ${response.status}`)
    const payload = (await response.json()) as { comments?: Array<Record<string, any>>; more?: boolean }
    const items: ExternalComment[] = (payload.comments ?? []).map((item) => ({
      id: String(item.commentId), source: 'netease',
      author: { id: String(item.user?.userId ?? ''), displayName: String(item.user?.nickname ?? '网易云用户'), avatarUrl: item.user?.avatarUrl ?? null },
      content: String(item.content ?? ''), likeCount: Number(item.likedCount ?? 0),
      createdAt: new Date(Number(item.time ?? Date.now())).toISOString(),
    }))
    return { items, nextCursor: items.at(-1)?.createdAt ? String(new Date(items.at(-1)!.createdAt).getTime()) : null, hasMore: Boolean(payload.more), fetchedAt: new Date().toISOString() }
  }

  async searchTracks(keyword: string, limit = 30, offset = 0): Promise<{ tracks: TrackRef[]; total: number }> {
    const response = await fetch(`${this.baseUrl}/cloudsearch?keywords=${encodeURIComponent(keyword)}&type=1&limit=${limit}&offset=${offset}&timestamp=${Date.now()}`, {
      headers: this.headers(), signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`Netease search returned HTTP ${response.status}`)
    const payload = (await response.json()) as { code?: number; result?: { songs?: Array<Record<string, any>>; songCount?: number } }
    if (payload.code !== 200) throw new Error(`Netease search returned code ${payload.code}`)
    const tracks = (payload.result?.songs ?? []).map((song) => this.normalizeTrack(song))
    return { tracks, total: Number(payload.result?.songCount ?? offset + tracks.length) }
  }

  async getHomeCatalog() {
    const newSongs = await this.json<{ code?: number; data?: Array<Record<string, any>> }>('/top/song?type=0')
    if (newSongs.code !== 200) throw new Error(`Netease new songs returned code ${newSongs.code}`)
    const recommended = await this.json<{ result?: Array<Record<string, any>> }>('/personalized?limit=10').catch(() => ({ result: [] }))
    const tracks = (newSongs.data ?? []).slice(0, 12).map((song) => this.normalizeTrack(song))
    if (!tracks.length) throw new Error('Netease returned an empty home catalog')
    return {
      hero: tracks[0], continueListening: tracks.slice(0, 2), quickPicks: tracks.slice(2, 6), recommendations: tracks,
      playlists: (recommended.result ?? []).map((item) => ({ id: String(item.id), name: String(item.name), description: String(item.copywriter ?? ''), trackCount: Number(item.trackCount ?? 0), durationText: '', coverUrl: item.picUrl ?? null })),
    }
  }

  async getRecommendedPlaylists() {
    const payload = await this.json<{ code?: number; result?: Array<Record<string, any>> }>('/personalized?limit=20')
    if (payload.code !== 200) throw new Error(`Netease playlists returned code ${payload.code}`)
    return (payload.result ?? []).map((item) => ({
      id: String(item.id), name: String(item.name), description: String(item.copywriter ?? ''),
      trackCount: Number(item.trackCount ?? 0), durationText: '', coverUrl: item.picUrl ?? null,
    }))
  }

  private normalizeTrack(song: Record<string, any>): TrackRef {
    const artists = song.ar ?? song.artists ?? []
    const album = song.al ?? song.album ?? null
    return {
      provider: 'netease', sourceId: String(song.id), name: String(song.name ?? '未知歌曲'),
      artists: artists.map((artist: Record<string, any>) => ({ sourceId: String(artist.id ?? ''), name: String(artist.name ?? '未知歌手') })),
      album: album ? { sourceId: String(album.id ?? ''), name: String(album.name ?? '未知专辑'), coverUrl: album.picUrl ?? null } : null,
      durationMs: Number(song.dt ?? song.duration ?? 0), coverUrl: album?.picUrl ?? null, availability: 'UNKNOWN',
    }
  }

  private inferExpiry(url: string) {
    try {
      const expires = new URL(url).searchParams.get('expires') || new URL(url).searchParams.get('e')
      if (!expires) return null
      const value = Number(expires)
      return Number.isFinite(value) ? new Date(value < 1e12 ? value * 1000 : value).toISOString() : null
    } catch { return null }
  }
}
