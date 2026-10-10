const chineseDigits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

function countOf(value: string) {
  if (/^\d+$/.test(value)) return Number(value)
  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (chineseDigits[value[1] ?? ''] ?? 0)
  if (value.endsWith('十')) return (chineseDigits[value[0] ?? ''] ?? 0) * 10
  if (value.includes('十')) return (chineseDigits[value[0] ?? ''] ?? 0) * 10 + (chineseDigits[value[2] ?? ''] ?? 0)
  return chineseDigits[value] ?? 0
}

export function requestIntent(text: string) {
  const countMatch = text.match(/(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*首/)
  const explicitCount = countMatch ? countOf(countMatch[1]!) : 0
  const wantsPlaylist = /(?:创建|生成|制作|建立|保存|做成|整理成|做|建|加到|加入).{0,8}(?:歌单|播放列表)|(?:歌单|播放列表).{0,8}(?:创建|生成|制作|保存|建立)|(?:给我|要|想要).{0,5}(?:一[个份张])?(?:歌单|播放列表)/.test(text)
  const asksForTracks = /(?:找|推荐|来|列出|给我|选).{0,20}(?:歌|曲|音乐)|(?:歌|曲|音乐).{0,20}(?:推荐|列表)/.test(text)
  return { requestedTrackCount: Math.min(30, explicitCount || (asksForTracks || wantsPlaylist ? 1 : 0)), wantsPlaylist }
}
