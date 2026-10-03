const listeners = new Set<() => void>()

export function onRoomTrackEnded(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function emitRoomTrackEnded() {
  for (const listener of listeners) listener()
}
