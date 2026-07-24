import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import {
  PLATE_MODELS,
  RESERVOIR,
  plateFootprint,
  reservoirFootprint,
  withinBed,
} from '@/lib/deck'
import {
  AxisLabels,
  Bed,
  PlateModel,
  Reservoir,
  StudioEnv,
  toSceneX,
  toSceneZ,
} from '@/components/deck/PrinterWorkspace'

// Pipette with a plunger that rises as liquid is drawn up.
function Toolhead({ color, plunger = 0 }: { color: string; plunger?: number }) {
  return (
    <group>
      <mesh position={[0, 3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.3, 6, 20]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 19, 0]}>
        <cylinderGeometry args={[3, 3, 26, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.5} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 33 + plunger, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 10, 16]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

// Pulsing ring under the active container.
function TargetRing({ x, z, color }: { x: number; z: number; color: string }) {
  const ring = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const s = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.18
    if (ring.current) ring.current.scale.set(s, s, s)
  })
  return (
    <group position={[x, 0.45, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={ring}>
        <ringGeometry args={[3, 4.4, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function PipetteCalibrationWorkspace() {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const plateType = useStore((s) => s.plateType)
  const pipette = useStore((s) => s.pipette)
  const th = useStore((s) => s.calibration.toolhead)
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const hx = bed.x / 2
  const hy = bed.y / 2
  const plateF = plateFootprint(deck, plate)
  const freshF = reservoirFootprint(deck.freshMedia)
  const wasteF = reservoirFootprint(deck.waste)

  const container =
    pipette.source === 'fresh' ? deck.freshMedia : pipette.source === 'waste' ? deck.waste : null
  const ringColor = pipette.source === 'fresh' ? '#ec4899' : '#475569'
  const toolColor = pipette.source ? '#ec4899' : '#0ea5e9'
  const cx = container ? container.x + RESERVOIR.width / 2 - hx : 0
  const cz = container ? toSceneZ(container.y + RESERVOIR.depth / 2, hy) : 0
  const plunger = Math.min(Math.abs(pipette.ePosition) * 0.5, 14)

  const nozzleRef = useRef<{ x: number; y: number; z: number } | null>(th)
  nozzleRef.current = th

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

        {container && <TargetRing x={cx} z={cz} color={ringColor} />}

        <group position={[toSceneX(th.x, hx), th.z, toSceneZ(th.y, hy)]}>
          <Toolhead color={toolColor} plunger={plunger} />
        </group>

        <ContactShadows position={[0, 0.14, 0]} scale={Math.max(bed.x, bed.y) * 1.5} blur={2.4} far={70} opacity={0.18} color="#1e3a8a" />
      </Suspense>

      <OrbitControls makeDefault target={[0, 16, 0]} enablePan enableZoom minDistance={120} maxDistance={1200} maxPolarAngle={Math.PI / 2.04} />
    </Canvas>
  )
}
