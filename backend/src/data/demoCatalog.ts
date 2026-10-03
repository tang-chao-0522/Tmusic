import type { TrackRef } from '@tmusic/contracts'

export const demoCatalogTracks: TrackRef[] = [
  ['1974443814', '春日回声', 'Yorushika', '春日回声', 321000],
  ['1974443815', '暮色与公路', 'n-buna', '花与夜之间', 258000],
  ['1974443816', '等夜晚降临', '一直真夜中就好。', '潮湿街灯', 276000],
  ['1974443817', '花照亮的街', 'Aimer', 'Walpurgis', 303000],
  ['1974443818', '你赠予的声音', 'Yorushika', '所以我放弃了音乐', 292000],
  ['1974443819', '星光归途', 'Saucy Dog', '如果那时', 269000],
  ['1974443820', '沉入深蓝', 'Yorushika', '幻灯', 371000],
  ['1974443821', '夜に溶ける', 'Eve', '蓝色时刻', 238000],
].map(([sourceId, name, artist, album, durationMs]) => ({
  provider: 'netease', sourceId: String(sourceId), name: String(name),
  artists: [{ sourceId: `artist-${sourceId}`, name: String(artist) }],
  album: { sourceId: `album-${sourceId}`, name: String(album), coverUrl: null },
  durationMs: Number(durationMs), coverUrl: null, availability: 'UNKNOWN',
}))

export const demoPlaylists = [
  { id: 'demo-spring', name: '春日回声', description: '那时的空气、光，以及音乐。春天仍在某处回响。', trackCount: 72, durationText: '4小时32分', coverUrl: null },
  { id: 'demo-night', name: '夜を歩く', description: '给睡不着的夜，一些安静陪伴。', trackCount: 56, durationText: '3小时48分', coverUrl: null },
  { id: 'demo-drive', name: '公路速写', description: '去往哪里都好，让声音带你向前。', trackCount: 41, durationText: '2小时35分', coverUrl: null },
  { id: 'demo-cafe', name: '咖啡馆小憩', description: '咖啡香气和轻柔旋律。', trackCount: 38, durationText: '2小时21分', coverUrl: null },
  { id: 'demo-rain', name: '雨后放晴', description: '哭过以后，天空总会亮起来。', trackCount: 29, durationText: '1小时57分', coverUrl: null },
]
