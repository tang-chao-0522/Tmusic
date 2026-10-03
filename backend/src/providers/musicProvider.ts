export type ProviderContext = { userId: string; serializedCookie?: string }

export type PlaybackGrant = {
  url: string
  expiresAt: string | null
  quality: string
  bitrate: number | null
  codec: string | null
  source: 'netease'
  availability: 'AVAILABLE' | 'LOGIN_REQUIRED' | 'VIP_REQUIRED' | 'REGION_BLOCKED' | 'UNAVAILABLE'
}

export type ExternalComment = {
  id: string
  source: 'netease'
  author: { id: string; displayName: string; avatarUrl: string | null }
  content: string
  likeCount: number
  createdAt: string
}

export interface MusicProvider {
  resolvePlayback(sourceId: string, quality: string, context: ProviderContext): Promise<PlaybackGrant>
  getComments(kind: 'track' | 'playlist', sourceId: string, cursor?: string): Promise<{ items: ExternalComment[]; nextCursor: string | null; hasMore: boolean; fetchedAt: string }>
}
