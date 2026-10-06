import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import type { TrackRef } from '@tmusic/contracts'
import { createRoom, joinRoom, leaveRoom, roomSnapshot, type Room } from '../../lib/api'
import { usePlayer } from '../../lib/player'
import { connectRoom } from '../../lib/roomSocket'
import { Button, Card, HERO, MiniPlayer, Page } from '../../components/ui'

type Connection = ReturnType<typeof connectRoom>
export default function Together() {
  const [room, setRoom] = useState<Room | null>(null); const [roomId, setRoomId] = useState(''); const [code, setCode] = useState(''); const [inviteCode, setInviteCode] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  const socket = useRef<Connection | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const current = usePlayer(s => s.current); const queue = usePlayer(s => s.queue)
  useEffect(() => {
    const target = room?.playback.track
    if (!target) return
    const player = usePlayer.getState()
    if (player.current?.sourceId !== target.sourceId && room.playback.isPlaying) void player.play(target, room.queue)
    else if (player.current?.sourceId === target.sourceId && player.playing !== room.playback.isPlaying) player.toggle()
  }, [room?.playback.stateVersion, room?.playback.track?.sourceId])
  const attach = (id: string, snapshot: Room) => {
    socket.current?.close(); setRoom(snapshot); setRoomId(id)
    socket.current = connectRoom(id, snapshot.realtimeTicket, (name, event) => {
      if (name === 'room:snapshot') setRoom(event.payload as Room)
      if (name === 'room:members') setRoom(prev => prev ? { ...prev, members: event.members as Room['members'] } : prev)
      if (name === 'playback:state') setRoom(prev => prev ? { ...prev, playback: event.payload as Room['playback'] } : prev)
      if (name === 'chat:message') setRoom(prev => prev ? { ...prev, messages: [...prev.messages, event.payload as Room['messages'][number]] } : prev)
      if (name === 'room:ended') { setRoom(null); setError('房间已结束') }
    })
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => roomSnapshot(id).then(setRoom).catch(() => undefined), 10000)
  }
  useDidShow(() => { const saved = Taro.getStorageSync('tmusic:room') as string; if (saved) roomSnapshot(saved).then(s => attach(saved, s)).catch(() => Taro.removeStorageSync('tmusic:room')) })
  useDidHide(() => { if (timer.current) clearInterval(timer.current); socket.current?.close(); socket.current = null })
  const create = () => createRoom(current ? [current, ...queue.filter(t => t.sourceId !== current.sourceId)] : []).then(result => { setInviteCode(result.inviteCode); Taro.setStorageSync('tmusic:room', result.id); Taro.setStorageSync('tmusic:room-code', result.inviteCode); return joinRoom(result.id, result.inviteCode).then(snapshot => attach(result.id, snapshot)) }).catch(e => setError(e.message))
  const join = () => joinRoom(roomId.trim(), code.trim()).then(snapshot => { Taro.setStorageSync('tmusic:room', roomId.trim()); Taro.setStorageSync('tmusic:room-code', code.trim()); attach(roomId.trim(), snapshot) }).catch(e => setError(e.message))
  const leave = () => { if (!room) return; const id = room.room.id; socket.current?.close(); if (timer.current) clearInterval(timer.current); leaveRoom(id).finally(() => { Taro.removeStorageSync('tmusic:room'); Taro.removeStorageSync('tmusic:room-code'); setRoom(null) }) }
  const send = () => { if (!message.trim()) return; socket.current?.emit('chat:send', { clientMessageId: `mini-${Date.now()}`, text: message.trim() }); setMessage('') }
  const control = (type: 'PLAY' | 'PAUSE' | 'NEXT' | 'PREVIOUS') => { if (!room) return; socket.current?.emit('playback:command', { commandId: `mini-${Date.now()}`, knownStateVersion: room.playback.stateVersion, type }) }
  const roomTrack: TrackRef | null = room?.playback.track || current
  return <Page active="/pages/together/index" theme="dark"><ScrollView scrollY className="page-scroll together-scroll"><View className="room-hero" style={{ backgroundImage: `linear-gradient(180deg,#0d1430aa,#10152b),url(${HERO})` }}><Text className="eyebrow">LISTEN TOGETHER</Text><Text className="page-title">一起听歌</Text><Text>两个人的音乐空间，同一首歌，同一个心跳。</Text></View>{error && <Text className="error-text">{error}</Text>}
    {!room ? <View className="room-entry"><View className="room-avatars"><Text>♫</Text><Text>♡</Text><Text>♫</Text></View><Text className="heading">此刻，有人和你听见同一束光。</Text><Button onClick={create}>＋ 创建双人房间</Button><Card><Text className="heading">加入好友房间</Text><Input value={roomId} onInput={e => setRoomId(e.detail.value)} placeholder="房间 ID" /><Input value={code} onInput={e => setCode(e.detail.value)} placeholder="邀请码" /><Button ghost onClick={join}>加入房间</Button></Card></View> : <View className="room-live"><View className="room-live-head"><Text>●　双人房间 · {room.members.length}/2</Text><Text onClick={leave}>离开</Text></View><View className="room-avatars"><Text>♫</Text><Text>♡</Text><Text>♫</Text></View><Text className="heading">{room.room.name}</Text><Text>同一首歌，同一个心跳。</Text><Card><Text className="track-name">{roomTrack?.name || '等待播放歌曲'}</Text><Text className="track-artist">{roomTrack?.artists[0]?.name}</Text><View className="transport"><Text onClick={() => control('PREVIOUS')}>Ⅰ◀</Text><Text className="play-circle" onClick={() => control(room.playback.isPlaying ? 'PAUSE' : 'PLAY')}>{room.playback.isPlaying ? 'Ⅱ' : '▶'}</Text><Text onClick={() => control('NEXT')}>▶Ⅰ</Text></View></Card><Text className="invite-code" onClick={() => { const value = `${room.room.id} ${inviteCode || code || Taro.getStorageSync('tmusic:room-code')}`; Taro.setClipboardData({ data: value }) }}>房间：{room.room.id}　邀请码：{inviteCode || code || Taro.getStorageSync('tmusic:room-code')}　复制</Text><View className="section-heading"><Text className="heading">房间留言</Text></View>{room.messages.map(item => <Text key={item.id} className="room-message">{item.sender.displayName}：{item.text}</Text>)}<View className="room-chat"><Input value={message} onInput={e => setMessage(e.detail.value)} onConfirm={send} placeholder="说点什么…" /><Text onClick={send}>发送</Text></View></View>}
  </ScrollView><MiniPlayer /></Page>
}
