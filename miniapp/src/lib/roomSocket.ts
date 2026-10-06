import Taro from '@tarojs/taro'
import type { Room } from './api'

type Event = { roomId: string; payload?: unknown; [key: string]: unknown }
export function connectRoom(roomId: string, ticket: string, onEvent: (name: string, event: Event) => void) {
  const origin = __API_URL__.replace(/\/api\/v1\/?$/, '').replace(/^http/, 'ws')
  const socket = Taro.connectSocket({ url: `${origin}/realtime/?EIO=4&transport=websocket` })
  let closed = false
  void socket.then(task => {
    if (closed) { task.close({}); return }
    task.onMessage(({ data }) => {
      const packet = String(data)
      if (packet.startsWith('0')) task.send({ data: `40${JSON.stringify({ ticket })}` })
      else if (packet === '2') task.send({ data: '3' })
      else if (packet.startsWith('40')) task.send({ data: `42${JSON.stringify(['room:join', { roomId }])}` })
      else if (packet.startsWith('42')) {
        try { const [name, event] = JSON.parse(packet.slice(2)) as [string, Event]; onEvent(name, event) } catch { /* Ignore malformed packets. */ }
      }
    })
  })
  return {
    emit: (name: string, payload: unknown) => { void socket.then(task => task.send({ data: `42${JSON.stringify([name, { roomId, payload }])}` })) },
    close: () => { closed = true; void socket.then(task => task.close({})) },
  }
}
export function roomFromEvent(event: Event): Room | null { return event.payload && typeof event.payload === 'object' ? event.payload as Room : null }
