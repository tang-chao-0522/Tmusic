import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { DemoTrack } from '../data/tracks'
import {
  getAccountOverview, getCatalogHome, getNeteaseComments, getNeteaseLibrary,
  getNeteaseLoginStatus, getRecentTracks, getTmusicComments, getTrackLyrics,
  resolvePlayback, searchCatalog, type LibraryType, type PlaybackGrant, type SearchType,
} from './api'

const minute = 60_000

export const queryKeys = {
  catalogHome: ['catalog-home'] as const,
  search: (keyword: string, type: SearchType) => ['catalog-search', keyword, type] as const,
  accountStatus: ['netease-login-status'] as const,
  accountOverviewRoot: ['netease-account-overview'] as const,
  accountOverview: (userId: number) => ['netease-account-overview', userId] as const,
  libraryRoot: ['netease-library'] as const,
  library: (userId: number, type: LibraryType) => ['netease-library', userId, type] as const,
  recentRoot: ['netease-recent-tracks'] as const,
  recent: (userId: number) => ['netease-recent-tracks', userId] as const,
  playlists: ['netease-playlists'] as const,
  lyrics: (sourceId: string) => ['track-lyrics', sourceId] as const,
  comments: (source: 'tmusic' | 'netease', provider: string, sourceId: string) => ['comments', source, provider, sourceId] as const,
  playbackRoot: ['playback-grant'] as const,
  playback: (userId: number | null, track: DemoTrack, quality: string) => ['playback-grant', userId, track.provider, track.sourceId, quality] as const,
}

// API functions transport data; these options own cache identity and freshness.
export const queries = {
  catalogHome: () => queryOptions({ queryKey: queryKeys.catalogHome, queryFn: ({ signal }) => getCatalogHome(signal), staleTime: 5 * minute, gcTime: 30 * minute }),
  search: (keyword: string, type: SearchType) => infiniteQueryOptions({
    queryKey: queryKeys.search(keyword, type), queryFn: ({ pageParam, signal }) => searchCatalog(keyword, type, pageParam, 30, signal),
    initialPageParam: 0, getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 5 * minute, gcTime: 30 * minute,
  }),
  accountStatus: () => queryOptions({ queryKey: queryKeys.accountStatus, queryFn: ({ signal }) => getNeteaseLoginStatus(signal), staleTime: 2 * minute, retry: false }),
  accountOverview: (userId: number) => queryOptions({ queryKey: queryKeys.accountOverview(userId), queryFn: ({ signal }) => getAccountOverview(signal), staleTime: 2 * minute, retry: false }),
  library: (userId: number, type: LibraryType) => queryOptions({ queryKey: queryKeys.library(userId, type), queryFn: ({ signal }) => getNeteaseLibrary(type, signal), staleTime: 3 * minute, retry: false }),
  recent: (userId: number) => infiniteQueryOptions({
    queryKey: queryKeys.recent(userId), queryFn: ({ pageParam, signal }) => getRecentTracks(pageParam, 30, signal),
    initialPageParam: 0, getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 2 * minute, retry: false,
  }),
  lyrics: (sourceId: string) => queryOptions({ queryKey: queryKeys.lyrics(sourceId), queryFn: ({ signal }) => getTrackLyrics(sourceId, signal), staleTime: 24 * 60 * minute, gcTime: 24 * 60 * minute, retry: false }),
  comments: (source: 'tmusic' | 'netease', provider: string, sourceId: string) => queryOptions({
    queryKey: queryKeys.comments(source, provider, sourceId),
    queryFn: ({ signal }) => source === 'tmusic' ? getTmusicComments(provider, sourceId, signal) : getNeteaseComments(provider, sourceId, signal),
    staleTime: source === 'tmusic' ? minute : 5 * minute,
  }),
  playback: (userId: number | null, track: DemoTrack, quality = 'exhigh') => queryOptions({
    queryKey: queryKeys.playback(userId, track, quality), queryFn: ({ signal }) => resolvePlayback(track, quality, signal),
    staleTime: (query) => {
      const grant = query.state.data as PlaybackGrant | undefined
      const remaining = grant?.expiresAt ? Date.parse(grant.expiresAt) - query.state.dataUpdatedAt - 10_000 : NaN
      return Number.isFinite(remaining) ? Math.max(0, Math.min(remaining, 30 * minute)) : 2 * minute
    },
    gcTime: 30 * minute, retry: false,
  }),
}

export async function clearAccountQueries(client: QueryClient) {
  const roots = [queryKeys.accountOverviewRoot, queryKeys.libraryRoot, queryKeys.recentRoot, queryKeys.playlists, queryKeys.playbackRoot]
  await Promise.all(roots.map((queryKey) => client.cancelQueries({ queryKey })))
  for (const queryKey of roots) client.removeQueries({ queryKey })
}

export function getCachedPlaybackGrant(client: QueryClient, track: DemoTrack, quality = 'exhigh') {
  const userId = client.getQueryData<Awaited<ReturnType<typeof getNeteaseLoginStatus>>>(queryKeys.accountStatus)?.account?.id ?? null
  const options = queries.playback(userId, track, quality)
  const cached = client.getQueryData<Awaited<ReturnType<typeof resolvePlayback>>>(options.queryKey)
  if (cached?.expiresAt && Date.parse(cached.expiresAt) < Date.now() + 10_000) client.removeQueries({ queryKey: options.queryKey, exact: true })
  return client.fetchQuery(options)
}
