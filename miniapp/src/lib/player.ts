import Taro from '@tarojs/taro'
import type { TrackRef } from '@tmusic/contracts'
import { useSyncExternalStore } from 'react'
import { createStore } from 'zustand/vanilla'
import { resolve } from './api'

type Player = {
  queue: TrackRef[]; current: TrackRef | null; playing: boolean; progress: number; duration: number; shuffle: boolean; repeat: boolean; error: string
  play: (track: TrackRef, queue?: TrackRef[]) => Promise<void>; toggle: () => void; next: () => void; previous: () => void; seek: (seconds: number) => void; toggleShuffle: () => void; toggleRepeat: () => void
}

let audio: Taro.InnerAudioContext | null = null
let playToken = 0
function engine() {
  if (!audio) {
    audio = Taro.createInnerAudioContext()
    audio.onTimeUpdate(() => usePlayer.setState({ progress: audio?.currentTime ?? 0, duration: audio?.duration ?? 0 }))
    audio.onEnded(() => {
      const state = usePlayer.getState()
      if (state.repeat && state.current) void state.play(state.current)
      else state.next()
    })
    audio.onError(() => usePlayer.setState({ playing: false, error: '播放失败，请尝试其他歌曲' }))
  }
  return audio
}
const playerStore = createStore<Player>((set, get) => ({
  queue: [], current: null, playing: false, progress: 0, duration: 0, shuffle: false, repeat: false, error: '',
  play: async (track, queue) => {
    const token = ++playToken
    engine().stop()
    set({ current: track, queue: queue?.length ? queue : get().queue.length ? get().queue : [track], progress: 0, playing: false, error: '' })
    try {
      const { url } = await resolve(track)
      if (token !== playToken) return
      const player = engine()
      player.src = url
      player.play()
      set({ playing: true })
    } catch (error) { if (token === playToken) set({ error: error instanceof Error ? error.message : '播放地址获取失败' }) }
  },
  toggle: () => { const player = engine(); if (get().playing) player.pause(); else player.play(); set({ playing: !get().playing }) },
  next: () => { const { queue, current, shuffle, play } = get(); if (!queue.length) return; const index = shuffle ? Math.floor(Math.random() * queue.length) : (queue.findIndex(t => t.sourceId === current?.sourceId) + 1) % queue.length; void play(queue[index]!, queue) },
  previous: () => { const { queue, current, play } = get(); if (!queue.length) return; const index = queue.findIndex(t => t.sourceId === current?.sourceId); void play(queue[(index - 1 + queue.length) % queue.length]!, queue) },
  seek: (seconds) => { engine().seek(seconds); set({ progress: seconds }) },
  toggleShuffle: () => set({ shuffle: !get().shuffle }),
  toggleRepeat: () => set({ repeat: !get().repeat }),
}))

type UsePlayer = {
  (): Player
  <T>(selector: (state: Player) => T): T
  getState: typeof playerStore.getState
  setState: typeof playerStore.setState
}

export const usePlayer = Object.assign(
  function usePlayer<T>(selector?: (state: Player) => T) {
    return useSyncExternalStore(
      playerStore.subscribe,
      () => selector ? selector(playerStore.getState()) : playerStore.getState(),
    )
  },
  { getState: playerStore.getState, setState: playerStore.setState },
) as UsePlayer
