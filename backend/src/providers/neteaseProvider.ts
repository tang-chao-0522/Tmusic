import { env } from '../config/env'
import type { ExternalComment, MusicProvider, PlaybackGrant, ProviderContext } from './musicProvider'
import type { TrackRef } from '@tmusic/contracts'
import { createHash } from 'node:crypto'

type NeteaseUrlItem = { id?: number; url?: string | null; br?: number; type?: string; level?: string; freeTrialInfo?: unknown; fee?: number }

export type CatalogSearchType = 'song' | 'playlist' | 'artist' | 'album'
export type PlaylistSummary = { id: string; name: string; description: string; trackCount: number; durationText: string; coverUrl: string | null; creatorName?: string; subscribed?: boolean }
export type AlbumSummary = { id: string; name: string; artistName: string; coverUrl: string | null; publishTime: string | null; size: number }
export type ArtistSummary = { id: string; name: string; coverUrl: string | null; albumCount: number; musicCount: number; followed?: boolean }

export function isAuthenticatedNeteaseAccount(account: Record<string, any> | null | undefined): boolean {
  return Boolean(account?.id && account.anonimousUser !== true && account.status !== -10)
}

export class NeteaseProvider implements MusicProvider {
  private readonly baseUrl = env.NETEASE_API_URL.replace(/\/$/, '')
  private readonly recentCache = new Map<string, { expiresAt: number; items: Array<{ track: TrackRef; playedAt: number | null }> }>()

  private headers(context?: ProviderContext): Record<string, string> {
    const serializedCookie = context ? context.serializedCookie : env.NETEASE_COOKIE
    const headers: Record<string, string> = { accept: 'application/json' }
    // NeteaseCloudMusicApi 4.32.0 splits request Cookie headers on "; " only.
    // The QR endpoint joins Set-Cookie values with ";" and must be normalized.
    if (serializedCookie) headers.cookie = serializedCookie.replace(/;\s*/g, '; ').trim()
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

  async userAccount(serializedCookie: string) {
    return this.json<{ code?: number; account?: Record<string, any>; profile?: Record<string, any> }>('/user/account', { userId: '', serializedCookie })
  }

  async logout(serializedCookie?: string) {
    return this.json<Record<string, any>>('/logout', { userId: '', serializedCookie })
  }

  async getUserDetail(userId: number, serializedCookie: string) {
    const payload = await this.json<{ code?: number; profile?: Record<string, any>; level?: number; listenSongs?: number; createDays?: number }>(`/user/detail?uid=${userId}`, { userId: String(userId), serializedCookie })
    if (payload.code !== 200) throw new Error(`Netease user detail returned code ${payload.code}`)
    return payload
  }

  async getAccountOverview(userId: number, serializedCookie: string) {
    const context = { userId: String(userId), serializedCookie }
    const [artists, liked] = await Promise.allSettled([
      this.json<{ code?: number; data?: Array<Record<string, any>> }>('/artist/sublist?limit=5', context),
      this.json<{ code?: number; ids?: number[] }>(`/likelist?uid=${userId}`, context),
    ])
    const artistItems = artists.status === 'fulfilled' && artists.value.code === 200 ? artists.value.data ?? [] : null
    const likedIds = liked.status === 'fulfilled' && liked.value.code === 200 ? liked.value.ids ?? [] : null
    return {
      artists: artistItems?.map((item) => this.normalizeArtist(item)) ?? null,
      likedCount: likedIds?.length ?? null,
    }
  }

  async getRecentTracks(serializedCookie: string, offset: number, limit: number) {
    const key = createHash('sha256').update(serializedCookie).digest('hex')
    let snapshot = this.recentCache.get(key)
    if (offset === 0 || !snapshot || snapshot.expiresAt < Date.now()) {
      const payload = await this.json<{ code?: number; data?: { list?: Array<Record<string, any>> } }>('/record/recent/song?limit=1000', { userId: '', serializedCookie })
      if (payload.code !== 200 || !Array.isArray(payload.data?.list)) throw new Error('Netease recent songs unavailable')
      const items = payload.data.list.filter((item) => (item.data ?? item.resourceData ?? item)?.id).map((item) => ({
        track: this.normalizeTrack(item.data ?? item.resourceData ?? item),
        playedAt: Number(item.playTime ?? 0) || null,
      }))
      for (const [cachedKey, cached] of this.recentCache) if (cached.expiresAt < Date.now()) this.recentCache.delete(cachedKey)
      if (this.recentCache.size >= 50) this.recentCache.delete(this.recentCache.keys().next().value!)
      snapshot = { items, expiresAt: Date.now() + 5 * 60_000 }
      this.recentCache.set(key, snapshot)
    }
    return { items: snapshot.items.slice(offset, offset + limit), total: snapshot.items.length }
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
      return { url: '', expiresAt: null, quality: item?.level ?? level, bitrate: item?.br ?? null, codec: item?.type ?? null, source: 'netease', availability: item?.fee === 1 ? 'VIP_REQUIRED' : context.serializedCookie ? 'UNAVAILABLE' : 'LOGIN_REQUIRED' }
    }

    return { url: item.url, expiresAt: this.inferExpiry(item.url), quality: item.level ?? level, bitrate: item.br ?? null, codec: item.type ?? null, source: 'netease', availability: 'AVAILABLE' }
  }

  async getLyrics(sourceId: string) {
    const payload = await this.json<{ code?: number; lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>(`/lyric?id=${encodeURIComponent(sourceId)}`)
    if (payload.code !== 200) throw new Error(`Netease lyrics returned code ${payload.code}`)
    return { original: payload.lrc?.lyric ?? '', translation: payload.tlyric?.lyric ?? '' }
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

  async searchCatalog(type: CatalogSearchType, keyword: string, limit = 30, offset = 0) {
    const upstreamType = { song: 1, album: 10, artist: 100, playlist: 1000 }[type]
    const payload = await this.json<{ code?: number; result?: Record<string, any> }>(
      `/cloudsearch?keywords=${encodeURIComponent(keyword)}&type=${upstreamType}&limit=${limit}&offset=${offset}`,
    )
    if (payload.code !== 200) throw new Error(`Netease search returned code ${payload.code}`)
    const result = payload.result ?? {}
    if (type === 'song') {
      const items = (result.songs ?? []).map((item: Record<string, any>) => this.normalizeTrack(item))
      return { items, total: Number(result.songCount ?? offset + items.length) }
    }
    if (type === 'playlist') {
      const items = (result.playlists ?? []).map((item: Record<string, any>) => this.normalizePlaylist(item))
      return { items, total: Number(result.playlistCount ?? offset + items.length) }
    }
    if (type === 'album') {
      const items = (result.albums ?? []).map((item: Record<string, any>) => this.normalizeAlbum(item))
      return { items, total: Number(result.albumCount ?? offset + items.length) }
    }
    const items = (result.artists ?? []).map((item: Record<string, any>) => this.normalizeArtist(item))
    return { items, total: Number(result.artistCount ?? offset + items.length) }
  }

  async getUserLibrary(type: 'playlist' | 'liked' | 'album' | 'artist', serializedCookie: string) {
    const status = await this.loginStatus(serializedCookie)
    const profile = status.data?.profile ?? status.profile
    const account = status.data?.account ?? status.account
    const userId = profile?.userId ?? account?.id
    if (!isAuthenticatedNeteaseAccount(account)) throw new Error('Netease login is required')
    const context = { userId: String(userId), serializedCookie }

    if (type === 'playlist') {
      const payload = await this.json<{ code?: number; playlist?: Array<Record<string, any>> }>(`/user/playlist?uid=${userId}&limit=1000`, context)
      if (payload.code !== 200) throw new Error(`Netease user playlists returned code ${payload.code}`)
      return (payload.playlist ?? []).map((item) => this.normalizePlaylist(item, userId))
    }
    if (type === 'album') {
      const payload = await this.json<{ code?: number; data?: Array<Record<string, any>> }>('/album/sublist?limit=1000', context)
      if (payload.code !== 200) throw new Error(`Netease album subscriptions returned code ${payload.code}`)
      return (payload.data ?? []).map((item) => this.normalizeAlbum(item))
    }
    if (type === 'artist') {
      const payload = await this.json<{ code?: number; data?: Array<Record<string, any>> }>('/artist/sublist?limit=1000', context)
      if (payload.code !== 200) throw new Error(`Netease artist subscriptions returned code ${payload.code}`)
      return (payload.data ?? []).map((item) => ({ ...this.normalizeArtist(item), followed: true }))
    }

    const liked = await this.json<{ code?: number; ids?: number[] }>(`/likelist?uid=${userId}`, context)
    if (liked.code !== 200) throw new Error(`Netease liked songs returned code ${liked.code}`)
    const ids = liked.ids ?? []
    const tracks: TrackRef[] = []
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500)
      const detail = await this.json<{ code?: number; songs?: Array<Record<string, any>> }>(`/song/detail?ids=${encodeURIComponent(chunk.join(','))}`, context)
      if (detail.code !== 200) throw new Error(`Netease song details returned code ${detail.code}`)
      tracks.push(...(detail.songs ?? []).map((item) => this.normalizeTrack(item)))
    }
    return tracks
  }

  async getHomeCatalog(serializedCookie?: string) {
    const newSongs = await this.json<{ code?: number; data?: Array<Record<string, any>> }>('/top/song?type=0')
    if (newSongs.code !== 200) throw new Error(`Netease new songs returned code ${newSongs.code}`)
    const recommended = await this.json<{ result?: Array<Record<string, any>> }>('/personalized?limit=10').catch(() => ({ result: [] }))
    const tracks = (newSongs.data ?? []).slice(0, 30).map((song) => this.normalizeTrack(song))
    if (!tracks.length) throw new Error('Netease returned an empty home catalog')
    const daily = serializedCookie ? await this.json<{ code?: number; data?: { dailySongs?: Array<Record<string, any>> }; recommend?: Array<Record<string, any>> }>(
      '/recommend/songs', { userId: '', serializedCookie },
    ).catch(() => null) : null
    const dailySongs = daily?.code === 200 ? daily.data?.dailySongs ?? daily.recommend ?? [] : []
    return {
      hero: tracks[0], guessYouLike: dailySongs.length ? dailySongs.slice(0, 2).map((song) => this.normalizeTrack(song)) : tracks.slice(1, 3),
      quickPicks: tracks.slice(2, 6), recommendations: tracks,
      playlists: (recommended.result ?? []).map((item) => this.normalizePlaylist(item)),
    }
  }

  async getRecommendedPlaylists() {
    const payload = await this.json<{ code?: number; result?: Array<Record<string, any>> }>('/personalized?limit=20')
    if (payload.code !== 200) throw new Error(`Netease playlists returned code ${payload.code}`)
    return (payload.result ?? []).map((item) => this.normalizePlaylist(item))
  }

  private normalizePlaylist(item: Record<string, any>, ownerUserId?: number): PlaylistSummary {
    const creator = item.creator ?? {}
    return {
      id: String(item.id), name: String(item.name ?? '未命名歌单'),
      description: String(item.description ?? item.copywriter ?? ''), trackCount: Number(item.trackCount ?? 0),
      durationText: '', coverUrl: item.coverImgUrl ?? item.picUrl ?? null,
      creatorName: creator.nickname ? String(creator.nickname) : undefined,
      subscribed: ownerUserId === undefined ? Boolean(item.subscribed) : Number(creator.userId) !== ownerUserId,
    }
  }

  private normalizeAlbum(item: Record<string, any>): AlbumSummary {
    const artist = item.artist ?? item.artists?.[0] ?? {}
    return {
      id: String(item.id), name: String(item.name ?? '未知专辑'), artistName: String(artist.name ?? '未知歌手'),
      coverUrl: item.picUrl ?? item.blurPicUrl ?? null,
      publishTime: item.publishTime ? new Date(Number(item.publishTime)).toISOString() : null,
      size: Number(item.size ?? 0),
    }
  }

  private normalizeArtist(item: Record<string, any>): ArtistSummary {
    return {
      id: String(item.id), name: String(item.name ?? '未知歌手'), coverUrl: item.picUrl ?? item.img1v1Url ?? null,
      albumCount: Number(item.albumSize ?? item.albumCount ?? 0), musicCount: Number(item.musicSize ?? item.musicCount ?? 0),
      followed: Boolean(item.followed),
    }
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
