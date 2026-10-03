import type { TrackRef } from '@tmusic/contracts'

export type DemoTrack = TrackRef & {
  id: string
  mood: string
  liked: boolean
  palette: [string, string]
}

export const demoTracks: DemoTrack[] = [
  {
    id: 'spring-echo',
    provider: 'netease',
    sourceId: 'demo-01',
    name: '春日回声',
    artists: [{ sourceId: 'artist-01', name: 'Yorushika' }],
    album: { sourceId: 'album-01', name: '春日回声', coverUrl: null },
    durationMs: 321_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '温柔',
    liked: true,
    palette: ['#dca7c9', '#766f9d'],
  },
  {
    id: 'twilight-highway',
    provider: 'netease',
    sourceId: 'demo-02',
    name: '暮色与公路',
    artists: [{ sourceId: 'artist-02', name: 'n-buna' }],
    album: { sourceId: 'album-02', name: '花与夜之间', coverUrl: null },
    durationMs: 258_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '夜行',
    liked: true,
    palette: ['#363c68', '#e18b9e'],
  },
  {
    id: 'wait-for-night',
    provider: 'netease',
    sourceId: 'demo-03',
    name: '等夜晚降临',
    artists: [{ sourceId: 'artist-03', name: '一直真夜中就好。' }],
    album: { sourceId: 'album-03', name: '潮湿街灯', coverUrl: null },
    durationMs: 276_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '治愈',
    liked: true,
    palette: ['#172749', '#7383b4'],
  },
  {
    id: 'blooming-street',
    provider: 'netease',
    sourceId: 'demo-04',
    name: '花照亮的街',
    artists: [{ sourceId: 'artist-04', name: 'Aimer' }],
    album: { sourceId: 'album-04', name: 'Walpurgis', coverUrl: null },
    durationMs: 303_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '氛围',
    liked: true,
    palette: ['#bd829c', '#513d6b'],
  },
  {
    id: 'gifted-sound',
    provider: 'netease',
    sourceId: 'demo-05',
    name: '你赠予的声音',
    artists: [{ sourceId: 'artist-01', name: 'Yorushika' }],
    album: { sourceId: 'album-05', name: '所以我放弃了音乐', coverUrl: null },
    durationMs: 292_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '安静',
    liked: true,
    palette: ['#c89596', '#27345b'],
  },
  {
    id: 'way-home',
    provider: 'netease',
    sourceId: 'demo-06',
    name: '星光归途',
    artists: [{ sourceId: 'artist-05', name: 'Saucy Dog' }],
    album: { sourceId: 'album-06', name: '如果那时', coverUrl: null },
    durationMs: 269_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '轻快',
    liked: true,
    palette: ['#29234c', '#9a71aa'],
  },
  {
    id: 'deep-blue',
    provider: 'netease',
    sourceId: 'demo-07',
    name: '沉入深蓝',
    artists: [{ sourceId: 'artist-01', name: 'Yorushika' }],
    album: { sourceId: 'album-07', name: '幻灯', coverUrl: null },
    durationMs: 371_000,
    coverUrl: null,
    availability: 'AVAILABLE',
    mood: '夜行',
    liked: true,
    palette: ['#202947', '#756386'],
  },
]

export function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
