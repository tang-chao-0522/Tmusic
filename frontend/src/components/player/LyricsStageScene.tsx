import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type StageLine = { timeMs: number; text: string; translation?: string }

type SceneProps = {
  lines: StageLine[]
  activeIndex: number
  coverUrl: string | null
  isPlaying: boolean
  compact: boolean
  reducedMotion: boolean
  onSeek: (timeMs: number) => void
  onUnavailable?: () => void
}

function createTextTexture(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 272
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '700 72px "Microsoft YaHei", "PingFang SC", sans-serif'
  const chars = [...text]
  const rows: string[] = []
  let row = ''
  for (const char of chars) {
    if (ctx.measureText(row + char).width > 1350 && row) { rows.push(row); row = char }
    else row += char
  }
  if (row) rows.push(row)
  const visible = rows.slice(0, 2)
  const startY = visible.length > 1 ? 93 : 136
  visible.forEach((part, index) => {
    const y = startY + index * 89
    ctx.shadowColor = '#a97bea'
    ctx.shadowBlur = 13
    ctx.fillStyle = '#ffffff'
    ctx.fillText(part, 48, y)
    ctx.shadowBlur = 0
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function LyricMesh({ line, offset, active, x, y, reducedMotion, onSeek }: { line: StageLine; offset: number; active: boolean; x: number; y: number; reducedMotion: boolean; onSeek: (timeMs: number) => void }) {
  const texture = useMemo(() => createTextTexture(line.text), [line.text])
  const translationTexture = useMemo(() => line.translation ? createTextTexture(line.translation) : null, [line.translation])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => () => translationTexture?.dispose(), [translationTexture])
  const group = useRef<THREE.Group>(null)
  const face = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const translation = useRef<THREE.MeshBasicMaterial>(null)
  const far = Math.abs(offset)
  const targetY = y - THREE.MathUtils.clamp(offset, -4.2, 4.2) * .82
  const targetZ = active ? 1.05 : -Math.min(far, 4.2) * .33
  const targetOpacity = far > 3 ? 0 : active ? 1 : Math.max(.13, .55 - far * .11)
  const initialPose = useRef({
    position: [x + .35, targetY + (offset >= 0 ? -.52 : .52), targetZ - .65] as [number, number, number],
    rotation: [0, -.16, 0] as [number, number, number],
    scale: .88,
  })

  useFrame((state, delta) => {
    if (!group.current || !face.current || !glow.current) return
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, .05) * 10)
    const animate = (current: number, target: number) => THREE.MathUtils.lerp(current, target, alpha)
    const targetX = x + (active ? 0 : .14)
    const targetScale = active ? 1.035 : Math.max(.84, .96 - far * .025)
    group.current.position.x = animate(group.current.position.x, targetX)
    group.current.position.y = animate(group.current.position.y, targetY)
    group.current.position.z = animate(group.current.position.z, targetZ)
    group.current.rotation.y = animate(group.current.rotation.y, active ? -.025 : -.09)
    group.current.scale.setScalar(animate(group.current.scale.x, targetScale))
    face.current.opacity = animate(face.current.opacity, targetOpacity)
    glow.current.opacity = animate(glow.current.opacity, active ? .32 : 0)
    if (translation.current) translation.current.opacity = animate(translation.current.opacity, active ? .72 : 0)
    if (Math.abs(group.current.position.y - targetY) > .005 || Math.abs(group.current.position.z - targetZ) > .005 || Math.abs(face.current.opacity - targetOpacity) > .005 || Math.abs(glow.current.opacity - (active ? .32 : 0)) > .005) state.invalidate()
  })

  return <group ref={group} position={initialPose.current.position} rotation={initialPose.current.rotation} scale={initialPose.current.scale}>
    <mesh position={[.04, -.035, -.075]} scale={[1.012, 1.018, 1]}>
      <planeGeometry args={[7.7, 1.36]} />
      <meshBasicMaterial ref={glow} map={texture} transparent opacity={0} depthWrite={false} color="#a86afb" toneMapped={false} />
    </mesh>
    <mesh onClick={(event) => { if (far <= 3) { event.stopPropagation(); onSeek(line.timeMs) } }}>
      <planeGeometry args={[7.7, 1.36]} />
      <meshBasicMaterial ref={face} map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
    {translationTexture ? <mesh position={[-.12, -.46, .015]}><planeGeometry args={[6.7, .74]} /><meshBasicMaterial ref={translation} map={translationTexture} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh> : null}
  </group>
}

function CoverFace({ coverUrl }: { coverUrl: string | null }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!coverUrl) { setTexture(null); return }
    setTexture(null)
    let disposed = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(coverUrl, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace
      if (disposed) loaded.dispose()
      else setTexture(loaded)
    }, undefined, () => { if (!disposed) setTexture(null) })
    return () => { disposed = true }
  }, [coverUrl])
  useEffect(() => () => { texture?.dispose() }, [texture])
  return <mesh position={[0, 0, .185]}>
    <ringGeometry args={[.50, 2.55, 96]} />
    <meshBasicMaterial map={texture} color={texture ? '#ffffff' : '#a68dc2'} side={THREE.DoubleSide} transparent opacity={texture ? .9 : .8} />
  </mesh>
}

function CaseEdges() {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(5.76, 5.76, .9)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#d9baf7" transparent opacity={.57} /></lineSegments>
}

function DiscDisplay({ coverUrl, isPlaying, reducedMotion, compact }: { coverUrl: string | null; isPlaying: boolean; reducedMotion: boolean; compact: boolean }) {
  const disc = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (isPlaying && !reducedMotion && disc.current) disc.current.rotation.z += delta * .25
    if (isPlaying && !reducedMotion && ring.current) ring.current.rotation.z -= delta * .12
  })
  return <group position={compact ? [0, .3, 0] : [-4.35, .32, 0]} rotation={[.04, -.18, 0]}>
    <mesh position={[0, -3.2, -.3]} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[3.35, 3.5, .27, 80]} />
      <meshStandardMaterial color="#0a1025" metalness={.85} roughness={.22} />
    </mesh>
    <mesh position={[0, -3.03, -.26]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[3.15, .034, 12, 96]} />
      <meshBasicMaterial color="#e9a4ff" toneMapped={false} />
    </mesh>
    <mesh position={[0, -2.92, -.22]} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[2.7, 2.8, .11, 80]} />
      <meshStandardMaterial color="#18203a" metalness={.9} roughness={.2} />
    </mesh>
    <group ref={disc}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[2.58, 2.58, .15, 96]} /><meshStandardMaterial color="#14182d" metalness={.85} roughness={.27} /></mesh>
      <CoverFace coverUrl={coverUrl} />
      <mesh position={[0, 0, .205]}><ringGeometry args={[2.55, 2.61, 96]} /><meshStandardMaterial color="#d8cdff" metalness={.8} roughness={.2} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0, .22]}><ringGeometry args={[.48, .57, 64]} /><meshStandardMaterial color="#eee5ff" metalness={.9} roughness={.15} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0, .26]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.45, .45, .13, 64]} /><meshStandardMaterial color="#080b19" metalness={.7} roughness={.24} /></mesh>
      <mesh position={[0, 0, .34]}><circleGeometry args={[.07, 32]} /><meshBasicMaterial color="#f1d0fa" /></mesh>
    </group>
    <mesh position={[0, 0, -.34]}><boxGeometry args={[5.72, 5.72, .06]} /><meshPhysicalMaterial color="#9eb7ec" metalness={.12} roughness={.1} transparent opacity={.15} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 0, .54]}><boxGeometry args={[5.74, 5.74, .04]} /><meshPhysicalMaterial color="#d5b8f8" metalness={.05} roughness={.05} transparent opacity={.12} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <CaseEdges />
    {[-1, 1].flatMap((sideX) => [-1, 1].map((sideY) => <mesh key={`${sideX}-${sideY}`} position={[sideX * 2.88, sideY * 2.88, .12]}><sphereGeometry args={[.064, 12, 12]} /><meshBasicMaterial color="#f2d8ff" toneMapped={false} /></mesh>))}
    <group ref={ring} rotation={[.34, .14, -.28]}>
      <mesh><torusGeometry args={[3.02, .017, 10, 128]} /><meshBasicMaterial color="#faabfa" toneMapped={false} /></mesh>
      <mesh><torusGeometry args={[3.08, .055, 8, 128]} /><meshBasicMaterial color="#9b78fa" transparent opacity={.18} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    <pointLight position={[1.6, 1.1, 3]} color="#ed9dff" intensity={20} distance={9} />
  </group>
}

function StageContents({ lines, activeIndex, coverUrl, isPlaying, compact, reducedMotion, onSeek, drag }: SceneProps & { drag: React.RefObject<{ x: number; y: number }> }) {
  const world = useRef<THREE.Group>(null)
  const previousIndex = useRef(activeIndex)
  const [exitingIndex, setExitingIndex] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (previousIndex.current === activeIndex) return
    setExitingIndex(previousIndex.current)
    previousIndex.current = activeIndex
    const timeout = window.setTimeout(() => setExitingIndex(null), reducedMotion ? 0 : 750)
    return () => window.clearTimeout(timeout)
  }, [activeIndex, reducedMotion])
  useFrame((state, delta) => {
    if (!world.current) return
    const speed = Math.min(1, delta * 5)
    world.current.rotation.y = THREE.MathUtils.lerp(world.current.rotation.y, drag.current.x, speed)
    world.current.rotation.x = THREE.MathUtils.lerp(world.current.rotation.x, drag.current.y, speed)
    if (Math.abs(world.current.rotation.y - drag.current.x) > .001 || Math.abs(world.current.rotation.x - drag.current.y) > .001) state.invalidate()
  })
  const indices = new Set<number>()
  for (const center of [activeIndex, exitingIndex]) {
    if (center === null) continue
    for (let index = Math.max(0, center - 3); index <= Math.min(lines.length - 1, center + 3); index++) indices.add(index)
  }
  const visible = [...indices].sort((a, b) => a - b).map((index) => ({ line: lines[index]!, index }))
  const shown = activeIndex < 0 ? 0 : activeIndex
  return <>
    <ambientLight intensity={1.5} />
    <directionalLight color="#a9bfff" intensity={2.4} position={[-4, 7, 9]} />
    <group ref={world} scale={compact ? .68 : 1} position={compact ? [0, 1.8, 0] : [0, 0, 0]}>
      <DiscDisplay coverUrl={coverUrl} isPlaying={isPlaying} reducedMotion={reducedMotion} compact={compact} />
      {!compact && visible.map(({ line, index }) => <LyricMesh key={`${line.timeMs}-${index}`} line={line} offset={index - shown} active={index === activeIndex} x={4.1} y={.45} reducedMotion={reducedMotion} onSeek={onSeek} />)}
    </group>
  </>
}

export function LyricsStageScene(props: SceneProps) {
  const drag = useRef({ x: 0, y: 0 })
  const pointer = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const suppressSeek = useRef(false)
  const invalidate = useRef<(() => void) | null>(null)
  const [webglFailed] = useState(() => !document.createElement('canvas').getContext('webgl2'))
  const [contextLost, setContextLost] = useState(false)
  useEffect(() => { if (webglFailed || contextLost) props.onUnavailable?.() }, [webglFailed, contextLost, props.onUnavailable])
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = pointer.current
    if (!current || current.id !== event.pointerId) return
    drag.current.x = THREE.MathUtils.clamp((event.clientX - current.startX) / 650, -.44, .44)
    drag.current.y = THREE.MathUtils.clamp((event.clientY - current.startY) / 750, -.21, .21)
    if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6) suppressSeek.current = true
    current.x = event.clientX
    current.y = event.clientY
    invalidate.current?.()
  }
  const onEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== event.pointerId) return
    pointer.current = null
    if (!props.reducedMotion) { drag.current.x = 0; drag.current.y = 0; invalidate.current?.() }
  }
  if (webglFailed || contextLost) return <div className="lyric-stage-scene-fallback" aria-hidden="true" />
  return <div className="lyric-stage-scene" onPointerDown={(event) => {
    if (event.button !== 0) return
    suppressSeek.current = false
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY }
  }} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd} onPointerLeave={onEnd}>
    <Canvas dpr={[1, 1.5]} frameloop={props.isPlaying ? 'always' : 'demand'} camera={{ position: [0, 0, 15], fov: 42, near: .1, far: 100 }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }} onCreated={({ gl, invalidate: requestFrame }) => {
      invalidate.current = requestFrame
      gl.setClearColor('#000000', 0)
      gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true), { once: true })
    }} fallback={<div className="lyric-stage-scene-fallback" />}>
      <StageContents {...props} onSeek={(timeMs) => { if (!suppressSeek.current) props.onSeek(timeMs) }} drag={drag} />
    </Canvas>
    <button className="lyric-stage-reset-view" type="button" onClick={() => { drag.current.x = 0; drag.current.y = 0; invalidate.current?.() }} aria-label="重置 3D 视角">重置视角</button>
  </div>
}
