import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export function ScrollingTitle({ text }: { text: string }) {
  const containerRef = useRef<HTMLHeadingElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scroll, setScroll] = useState({ active: false, distance: 0, duration: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    const label = textRef.current
    if (!container || !label) return
    const measure = () => {
      const width = label.getBoundingClientRect().width
      const active = width > container.clientWidth + 1
      const distance = width + 48
      setScroll((current) => current.active === active && current.distance === distance ? current : {
        active, distance, duration: Math.max(8, distance / 38),
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(label)
    measure()
    return () => observer.disconnect()
  }, [text])

  const style = { '--title-distance': `-${scroll.distance}px`, '--title-duration': `${scroll.duration}s` } as CSSProperties
  return <h1 className={`full-track-title ${scroll.active ? 'is-scrolling' : ''}`} ref={containerRef} aria-label={text} title={text}>
    <span className="full-track-title-content" style={style} aria-hidden="true">
      <span ref={textRef}>{text}</span>
      {scroll.active ? <span>{text}</span> : null}
    </span>
  </h1>
}
