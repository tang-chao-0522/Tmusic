import { Heart, Plus } from 'lucide-react'
import { TrackArtwork } from '../player/TrackArtwork'
import type { DemoTrack } from '../../data/tracks'

export function RoomPerson({ name, image, empty = false }: { name: string; image?: string; empty?: boolean }) {
  return <div className="room-person">
    <div className={`room-person-avatar ${empty ? 'is-empty' : ''}`}>
      {empty ? <Plus size={31} strokeWidth={1.5} /> : image ? <img src={image} alt="" /> : <span>{name.slice(0, 1)}</span>}
    </div>
    <span className="room-person-name">{!empty && <i className="room-online-dot" />}{name}</span>
  </div>
}

export function RoomConnection({ left, right, leftImage, rightImage, emptyRight = false }: { left: string; right: string; leftImage?: string; rightImage?: string; emptyRight?: boolean }) {
  return <div className="room-connection">
    <RoomPerson name={left} image={leftImage} />
    <div className="room-connection-line" aria-hidden="true"><span /><Heart size={27} fill="currentColor" /><span /></div>
    <RoomPerson name={right} image={rightImage} empty={emptyRight} />
  </div>
}

export function RoomTrackTile({ track, onPlay }: { track?: DemoTrack | null; onPlay?: () => void }) {
  return <div className={`room-track-tile ${onPlay ? 'is-playable' : ''}`} role={onPlay ? 'button' : undefined} tabIndex={onPlay ? 0 : undefined} onClick={onPlay} onKeyDown={(event) => { if (onPlay && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onPlay() } }} aria-label={onPlay && track ? `播放 ${track.name}` : undefined}>
    {track ? <TrackArtwork className="room-track-tile-art" coverUrl={track.coverUrl} palette={track.palette} /> : <div className="room-track-tile-art room-track-placeholder">♫</div>}
    <div className="room-track-tile-copy"><strong>{track?.name ?? '还没有选择歌曲'}</strong><span>{track?.artists.map((artist) => artist.name).join(' / ') ?? '添加歌曲，开始分享音乐'}</span></div>
  </div>
}
