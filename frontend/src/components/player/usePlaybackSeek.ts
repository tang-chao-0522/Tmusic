import { useEffect, useRef, useState, type ChangeEvent } from 'react'

export function usePlaybackSeek(positionMs: number, onSeek: (positionMs: number) => void, deferUntilRelease: boolean, trackId?: string) {
  const [draft, setDraft] = useState<number | null>(null)
  const draftRef = useRef<number | null>(null)

  useEffect(() => { draftRef.current = null; setDraft(null) }, [trackId])

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value)
    if (!deferUntilRelease) { onSeek(next); return }
    draftRef.current = next
    setDraft(next)
  }

  function commit() {
    const next = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (next !== null) onSeek(next)
  }

  return { value: draft ?? positionMs, onChange, onPointerUp: commit, onKeyUp: commit, onBlur: commit }
}
