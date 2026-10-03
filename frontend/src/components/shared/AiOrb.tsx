import { Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function AiOrb() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hintOpen, setHintOpen] = useState(false)

  if (location.pathname.startsWith('/ai')) return null

  return (
    <div className="ai-orb-wrap">
      {hintOpen ? (
        <div className="ai-orb-popover glass-panel">
          <button type="button" className="popover-close" onClick={() => setHintOpen(false)} aria-label="关闭">
            <X size={15} />
          </button>
          <span className="eyebrow">TMusic AI</span>
          <strong>今天想听什么？</strong>
          <p>告诉我你的心情、场景或喜欢的声音。</p>
          <button type="button" className="soft-primary" onClick={() => navigate('/ai')}>开始对话</button>
        </div>
      ) : null}
      <button
        type="button"
        className="ai-orb"
        onClick={() => setHintOpen((value) => !value)}
        onDoubleClick={() => navigate('/ai')}
        aria-label="打开 AI 音乐助手"
      >
        <span className="orb-wave wave-one" />
        <span className="orb-wave wave-two" />
        <Sparkles size={22} />
      </button>
    </div>
  )
}
