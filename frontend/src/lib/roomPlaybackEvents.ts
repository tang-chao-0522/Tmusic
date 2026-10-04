import type { DemoTrack } from '../data/tracks'

const listeners = new Set<() => void>()
let playTrackInRoom: ((track: DemoTrack, tracks?: DemoTrack[]) => void) | null = null
let seekRoomTo: ((positionMs: number) => void) | null = null

export function onRoomPlayRequested(listener: (track: DemoTrack, tracks?: DemoTrack[]) => void) {
  playTrackInRoom = listener
  return () => { if (playTrackInRoom === listener) playTrackInRoom = null }
}

export function requestRoomPlay(track: DemoTrack, tracks?: DemoTrack[]) {
  playTrackInRoom?.(track, tracks)
}

export function onRoomSeekRequested(listener: (positionMs: number) => void) {
  seekRoomTo = listener
  return () => { if (seekRoomTo === listener) seekRoomTo = null }
}

export function requestRoomSeek(positionMs: number) {
  seekRoomTo?.(positionMs)
}

export function onRoomTrackEnded(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function emitRoomTrackEnded() {
  for (const listener of listeners) listener()
}
