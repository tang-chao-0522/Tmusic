import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { demoTracks, type DemoTrack } from '../data/tracks'

type RepeatMode = 'off' | 'all' | 'one'

type PlayerState = {
  queue: DemoTrack[]
  currentId: string
  isPlaying: boolean
  progressMs: number
  volume: number
  shuffle: boolean
  repeatMode: RepeatMode
  queueOpen: boolean
  openQueue: () => void
  closeQueue: () => void
  play: (track?: DemoTrack) => void
  playQueue: (tracks: DemoTrack[], startIndex?: number, shuffle?: boolean) => void
  pause: () => void
  toggle: () => void
  next: () => void
  previous: () => void
  seek: (progressMs: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  loadCatalogTracks: (tracks: DemoTrack[]) => void
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: demoTracks,
      currentId: demoTracks[1]?.id ?? '',
      isPlaying: false,
      progressMs: 154_000,
      volume: 0.72,
      shuffle: false,
      repeatMode: 'all',
      queueOpen: false,
      openQueue: () => set({ queueOpen: true }),
      closeQueue: () => set({ queueOpen: false }),
      play: (track) =>
        set((state) => ({
          queue: track && !state.queue.some((item) => item.id === track.id) ? [track, ...state.queue] : state.queue,
          currentId: track?.id ?? state.currentId,
          progressMs: track && track.id !== state.currentId ? 0 : state.progressMs,
          isPlaying: true,
        })),
      playQueue: (tracks, startIndex = 0, shuffle = false) => {
        const selected = tracks[startIndex]
        if (!selected) return
        const remaining = [...tracks.slice(startIndex + 1), ...tracks.slice(0, startIndex)]
        if (shuffle) {
          for (let index = remaining.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1))
            ;[remaining[index], remaining[randomIndex]] = [remaining[randomIndex]!, remaining[index]!]
          }
        }
        set({ queue: [selected, ...remaining], currentId: selected.id, progressMs: 0, isPlaying: true, shuffle })
      },
      pause: () => set({ isPlaying: false }),
      toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
      next: () => {
        const state = get()
        const currentIndex = state.queue.findIndex((track) => track.id === state.currentId)
        const nextTrack = state.queue[(currentIndex + 1) % state.queue.length]
        if (nextTrack) set({ currentId: nextTrack.id, progressMs: 0, isPlaying: true })
      },
      previous: () => {
        const state = get()
        if (state.progressMs > 3_000) return set({ progressMs: 0 })
        const currentIndex = state.queue.findIndex((track) => track.id === state.currentId)
        const index = currentIndex <= 0 ? state.queue.length - 1 : currentIndex - 1
        const previousTrack = state.queue[index]
        if (previousTrack) set({ currentId: previousTrack.id, progressMs: 0, isPlaying: true })
      },
      seek: (progressMs) => set({ progressMs }),
      setVolume: (volume) => set({ volume }),
      toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
      cycleRepeat: () =>
        set((state) => ({ repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off' })),
      loadCatalogTracks: (tracks) => set((state) => {
        if (!tracks.length || !state.queue.every((item) => item.sourceId.startsWith('demo-'))) return state
        return { queue: tracks, currentId: tracks[0]?.id ?? state.currentId, progressMs: 0, isPlaying: false }
      }),
    }),
    {
      name: 'tmusic:player',
      partialize: (state) => ({
        queue: state.queue,
        currentId: state.currentId,
        progressMs: state.progressMs,
        volume: state.volume,
        shuffle: state.shuffle,
        repeatMode: state.repeatMode,
        isPlaying: false,
      }),
    },
  ),
)
