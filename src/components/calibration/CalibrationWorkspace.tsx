import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import {
  PLATE_MODELS,
  plateFootprint,
  reservoirFootprint,
  withinBed,
} from '@/lib/deck'
import { CAL_STEPS, calTargets, type Vec3 } from '@/lib/calibration'
import {
  AxisLabels,
  Bed,
  PlateModel,
  toSceneX,
  toSceneZ,
  Reservoir,
  StudioEnv,
} from '@/components/deck/PrinterWorkspace'

// Pipette / toolhead — rendered with its tip at the local origin.
function Toolhead({ color, opacity = 1 }: { color: string; opacity?: number }) {
  const transparent = opacity < 1
  return (
    <group>
      <mesh position={[0, 3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.3, 6, 20]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh position={[0, 19, 0]}>
        <cylinderGeometry args={[3, 3, 26, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.35} roughness={0.45} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh position={[0, 35, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 8, 16]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} transparent={transparent} opacity={opacity} />
      </mesh>
    </group>
  )
}

// Bobbing ghost toolhead + pulsing reticle that instruct the user where to go.
function Guide({ target, color, hx, hy }: { target: Vec3; color: string; hx: number; hy: number }) {
  const ghost = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const tx = target.x - hx
  const tz = toSceneZ(target.y, hy)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ghost.current) ghost.current.position.y = target.z + 14 + (Math.sin(t * 2.2) + 1) * 7
    if (ring.current) {
      const s = 1 + Math.sin(t * 2.2) * 0.18
      ring.current.scale.set(s, s, s)
    }
  })

  return (
    <group>
      <group ref={ghost} position={[tx, target.z + 14, tz]}>
        <Toolhead color={color} opacity={0.4} />
      </group>
      <group position={[tx, 0.4, tz]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={ring}>
          <ringGeometry args={[2.6, 3.7, 36]} />
          <meshBasicMaterial color={color} transparent opacity={0.92} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[1.1, 20]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      <Html position={[tx, target.z + 34, tz]} center style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: color }}>
          move here
        </div>
      </Html>
    </group>
  )
}

export function CalibrationWorkspace() {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const plateType = useStore((s) => s.plateType)
  const cal = useStore((s) => s.calibration)
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const hx = bed.x / 2
  const hy = bed.y / 2

  const plateF = plateFootprint(deck, plate)
  const freshF = reservoirFootprint(deck.freshMedia)
  const wasteF = reservoirFootprint(deck.waste)

  const step = cal.activeStep >= 0 ? CAL_STEPS[cal.activeStep] : null
  const targets = calTargets(deck, plate, model)
  const target = step ? targets[step.key] : null

  // Only reveal objects that have somewhere real to sit. While a step is active,
  // show just the object being calibrated (floating on the empty bed) so nothing
  // implies a placement that hasn't been captured yet. Once every point is set,
  // show the whole deck assembled at its calibrated coordinates.
  // The clearance step is the exception: judging safe travel height means seeing
  // every object at once.
  const allDone = CAL_STEPS.every((s) => cal.captured[s.key])
  const showAll = step ? step.group === 'clearance' : allDone
  const activeKind = step ? (step.group === 'plate' ? 'plate' : step.key) : null
  const showPlate = showAll || activeKind === 'plate'
  const showFresh = showAll || activeKind === 'fresh'
  const showWaste = showAll || activeKind === 'waste'
  const stepColor = !step
    ? '#2563eb'
    : step.group === 'plate'
      ? '#2563eb'
      : step.key === 'fresh'
        ? '#ec4899'
        : step.key === 'clearance'
          ? '#059669'
          : '#475569'

  const th = cal.toolhead
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

        {showPlate && (
          <Suspense fallback={null}>
            <PlateModel model={model} plate={plate} x={deck.plate.x} y={deck.plate.y} z={deck.plate.z} rotation={deck.plate.rotation} hx={hx} hy={hy} outOfBounds={!withinBed(plateF, bed)} />
          </Suspense>
        )}
        {showFresh && (
          <Reservoir x={deck.freshMedia.x} y={deck.freshMedia.y} hx={hx} hy={hy} height={deck.freshMedia.height} color="#ec4899" outOfBounds={!withinBed(freshF, bed)} nozzleRef={nozzleRef} />
        )}
        {showWaste && (
          <Reservoir x={deck.waste.x} y={deck.waste.y} hx={hx} hy={hy} height={deck.waste.height} color="#475569" outOfBounds={!withinBed(wasteF, bed)} nozzleRef={nozzleRef} />
        )}

        {/* Live toolhead at the tracked machine position */}
        <group position={[toSceneX(th.x, hx), th.z, toSceneZ(th.y, hy)]}>
          <Toolhead color="#0ea5e9" />
        </group>

        {target && <Guide target={target} color={stepColor} hx={hx} hy={hy} />}

        {/* Empty state — before any step is picked, the bed sits bare. */}
        {!step && !allDone && (
          <Html position={[0, 24, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="whitespace-nowrap rounded-full border border-border bg-white/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              Pick a calibration step to begin
            </div>
          </Html>
        )}

        <ContactShadows position={[0, 0.14, 0]} scale={Math.max(bed.x, bed.y) * 1.5} blur={2.4} far={70} opacity={0.18} color="#1e3a8a" />
      </Suspense>

      <OrbitControls makeDefault target={[0, 20, 0]} enablePan enableZoom minDistance={120} maxDistance={1200} maxPolarAngle={Math.PI / 2.04} />
    </Canvas>
  )
}
