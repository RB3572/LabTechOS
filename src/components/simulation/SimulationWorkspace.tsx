import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import {
  PLATE_MODELS,
  plateFootprint,
  reservoirFootprint,
  withinBed,
} from '@/lib/deck'
import {
  AxisLabels,
  Bed,
  type NozzleRef,
  PlateModel,
  Reservoir,
  StudioEnv,
  toSceneX,
  toSceneZ,
} from '@/components/deck/PrinterWorkspace'
import { type SimSample, type SimTimeline, sampleTimeline } from '@/lib/sim'

const TRAVEL = '#0ea5e9'
const CARRY = '#ec4899'

// Pipette / toolhead — tip recolors while carrying liquid.
function Toolhead({
  groupRef,
  tipMat,
}: {
  groupRef: React.MutableRefObject<THREE.Group | null>
  tipMat: React.MutableRefObject<THREE.MeshStandardMaterial | null>
}) {
  return (
    <group ref={groupRef}>
      <mesh position={[0, 3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.3, 6, 20]} />
        <meshStandardMaterial ref={tipMat} color={TRAVEL} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 19, 0]}>
        <cylinderGeometry args={[3, 3, 26, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 35, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 8, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

// Drives the toolhead each frame from the shared time ref.
function Playhead({
  timeline,
  hx,
  hy,
  tRef,
  playingRef,
  speedRef,
  onTick,
  onEnded,
  groupRef,
  tipMat,
  nozzleRef,
}: {
  timeline: SimTimeline
  hx: number
  hy: number
  tRef: React.MutableRefObject<number>
  playingRef: React.MutableRefObject<boolean>
  speedRef: React.MutableRefObject<number>
  onTick: (tMs: number, s: SimSample) => void
  onEnded: () => void
  groupRef: React.MutableRefObject<THREE.Group | null>
  tipMat: React.MutableRefObject<THREE.MeshStandardMaterial | null>
  nozzleRef: NozzleRef
}) {
  const lastUi = useRef(0)
  const lastCarry = useRef<boolean | null>(null)

  useFrame((_, delta) => {
    if (playingRef.current) {
      tRef.current += delta * 1000 * speedRef.current
      if (tRef.current >= timeline.total) {
        tRef.current = timeline.total
        playingRef.current = false
        onEnded()
      }
    }
    const s = sampleTimeline(timeline, tRef.current)
    nozzleRef.current = s.pos
    if (groupRef.current) groupRef.current.position.set(toSceneX(s.pos.x, hx), s.pos.z, toSceneZ(s.pos.y, hy))
    if (tipMat.current && lastCarry.current !== s.carrying) {
      tipMat.current.color.set(s.carrying ? CARRY : TRAVEL)
      lastCarry.current = s.carrying
    }
    // throttle UI updates so the React tree isn't touched 60×/s
    if (tRef.current - lastUi.current > 90 || !playingRef.current) {
      lastUi.current = tRef.current
      onTick(tRef.current, s)
    }
  })

  return null
}

export function SimulationWorkspace({
  timeline,
  tRef,
  playingRef,
  speedRef,
  onTick,
  onEnded,
}: {
  timeline: SimTimeline
  tRef: React.MutableRefObject<number>
  playingRef: React.MutableRefObject<boolean>
  speedRef: React.MutableRefObject<number>
  onTick: (tMs: number, s: SimSample) => void
  onEnded: () => void
}) {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const plateType = useStore((s) => s.plateType)
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const hx = bed.x / 2
  const hy = bed.y / 2

  const plateF = plateFootprint(deck, plate)
  const freshF = reservoirFootprint(deck.freshMedia)
  const wasteF = reservoirFootprint(deck.waste)

  const groupRef = useRef<THREE.Group | null>(null)
  const tipMat = useRef<THREE.MeshStandardMaterial | null>(null)
  const nozzleRef = useRef<{ x: number; y: number; z: number } | null>(null)

  // Faint full tool-path for context.
  const pathPoints = useMemo<[number, number, number][]>(() => {
    const pts: [number, number, number][] = []
    const steps = timeline.steps
    if (steps.length) {
      const f0 = steps[0].seg.from
      pts.push([toSceneX(f0.x, hx), f0.z, toSceneZ(f0.y, hy)])
    }
    for (const st of steps) {
      pts.push([toSceneX(st.seg.to.x, hx), st.seg.to.z, toSceneZ(st.seg.to.y, hy)])
    }
    return pts
  }, [timeline, hx, hy])

  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} shadows={false}>
      <PerspectiveCamera makeDefault fov={38} position={[-170, 235, 300]} near={1} far={5000} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[140, 280, 160]} intensity={1.1} />
      <directionalLight position={[-180, 120, -140]} intensity={0.4} />

      <Suspense fallback={null}>
        <StudioEnv />
        <Bed bed={bed} />
        <AxisLabels bed={bed} />

        <Suspense fallback={null}>
          <PlateModel model={model} plate={plate} x={deck.plate.x} y={deck.plate.y} z={deck.plate.z} hx={hx} hy={hy} rotation={deck.plate.rotation} outOfBounds={!withinBed(plateF, bed)} />
        </Suspense>
        <Reservoir x={deck.freshMedia.x} y={deck.freshMedia.y} hx={hx} hy={hy} height={deck.freshMedia.height} color="#ec4899" outOfBounds={!withinBed(freshF, bed)} nozzleRef={nozzleRef} />
        <Reservoir x={deck.waste.x} y={deck.waste.y} hx={hx} hy={hy} height={deck.waste.height} color="#475569" outOfBounds={!withinBed(wasteF, bed)} nozzleRef={nozzleRef} />

        {pathPoints.length > 1 && (
          <Line points={pathPoints} color="#94a3b8" lineWidth={1} transparent opacity={0.35} />
        )}

        <Toolhead groupRef={groupRef} tipMat={tipMat} />
        <Playhead
          timeline={timeline}
          hx={hx}
          hy={hy}
          tRef={tRef}
          playingRef={playingRef}
          speedRef={speedRef}
          onTick={onTick}
          onEnded={onEnded}
          groupRef={groupRef}
          tipMat={tipMat}
          nozzleRef={nozzleRef}
        />

        <ContactShadows position={[0, 0.14, 0]} scale={Math.max(bed.x, bed.y) * 1.5} blur={2.4} far={70} opacity={0.18} color="#1e3a8a" />
      </Suspense>

      <OrbitControls makeDefault target={[0, 16, 0]} enablePan enableZoom minDistance={120} maxDistance={1200} maxPolarAngle={Math.PI / 2.04} />
    </Canvas>
  )
}
