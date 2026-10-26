import type { StageLine } from '../components/player/LyricsStageScene'

const verses: Record<string, string[]> = {
  'demo-01': ['春风越过安静的街', '把回忆轻轻吹到眼前', '云影落在你的肩', '像未说出口的那句再见', '如果时间慢一点', '我会记住这一刻的晴天', '让旋律绕过屋檐', '回声又回到你身边'],
  'demo-02': ['暮色沿着公路蔓延', '城市的灯一盏一盏亮起', '车窗映着遥远的天', '我们驶向没有名字的夜', '风经过耳边', '把心事留在下一个路口', '当最后的余晖熄灭', '星光会替我们指引方向'],
  'demo-03': ['等夜晚慢慢降临', '让微光停在窗边', '有些话不必说清', '也能被风温柔听见', '月亮升上屋顶', '我们在安静中相遇', '等夜晚慢慢降临', '把这一刻交给星星'],
}

const fallback = ['听见远处的风', '穿过此刻的夜空', '让时间慢慢流动', '让光落在你眼中', '随着旋律向前走', '把每一刻留在心中', '回头看那些温柔', '都成为闪亮的星空']

export function getStageDemoLyrics(sourceId: string): StageLine[] {
  if (!sourceId.startsWith('demo-')) return []
  return (verses[sourceId] ?? fallback).map((text, index) => ({ timeMs: index * 29_000, text }))
}
