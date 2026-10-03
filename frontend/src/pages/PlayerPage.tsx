import { ListMusic, Maximize2, Mic2 } from 'lucide-react'
import { PageTopbar } from '../components/layout/PageTopbar'
import { usePlayerStore } from '../stores/playerStore'

const lyrics = ['无论在哪里，都还能相遇', '抬头看向那片熟悉的天空', '风把旧日的歌声轻轻带来', '一定，一定，不会忘记', '', '即使季节不断经过', '仍然保持那时的模样', '你赠予我的声音', '此刻，仍在这里']

export function PlayerPage() {
  const state = usePlayerStore()
  const track = state.queue.find((item) => item.id === state.currentId) ?? state.queue[0]
  if (!track) return null
  return <div className="immersive-page full-player-page page-with-player">
    <PageTopbar /><div className="ambient-petals" />
    <section className="full-track-copy"><span>NOW PLAYING</span><h1>{track.name}</h1><h2>{track.artists[0]?.name}</h2><p>「那时听见的声音，<br />仍在某处轻轻回响。」</p></section>
    <aside className="lyrics-panel glass-panel"><nav><button className="active">歌词</button><button>播放队列</button><ListMusic /></nav><div className="lyrics-scroll">{lyrics.map((line, index) => <p className={index >= 5 && index <= 7 ? 'active' : ''} key={`${line}-${index}`}>{line || '\u00a0'}</p>)}</div><footer><Mic2 /><span>A</span><Maximize2 /></footer></aside>
  </div>
}
