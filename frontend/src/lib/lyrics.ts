export type LyricLine = { timeMs: number | null; text: string; translation?: string }

const timestamp = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g

export function parseLyricLines(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of source.split(/\r?\n/)) {
    const marks = [...raw.matchAll(timestamp)]
    const text = raw.replace(timestamp, '').trim()
    if (!text || /^\[(?:ar|al|ti|by|offset|length):/i.test(raw)) continue
    if (!marks.length) { if (!raw.startsWith('[')) lines.push({ timeMs: null, text }); continue }
    for (const mark of marks) {
      const milliseconds = Number((mark[3] ?? '').padEnd(3, '0'))
      lines.push({ timeMs: (Number(mark[1]) * 60 + Number(mark[2])) * 1000 + milliseconds, text })
    }
  }
  return lines.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))
}
