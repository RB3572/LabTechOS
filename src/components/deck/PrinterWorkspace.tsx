import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  Lightformer,
  Line,
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
} from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import type { BedSize, DeckObjectKey, Plate } from '@/types'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { PLATES } from '@/lib/plate'
import {
  PLATE_MODELS,
  RESERVOIR,
  RESERVOIR_MODEL,
  type Footprint,
  type PlateModelDef,
  clearances,
  plateFootprint,
  reservoirFootprint,
  snapValue,
  withinBed,
} from '@/lib/deck'

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

const OBJECT_KEYS: DeckObjectKey[] = ['plate', 'freshMedia', 'waste']

// ---------------------------------------------------------------------------
// Studio environment — bright soft panels so the glass reads as glass
// ---------------------------------------------------------------------------

export function StudioEnv() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 320, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[700, 700, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#dbeafe" position={[-260, 110, 180]} scale={[340, 220, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[260, 150, -160]} scale={[340, 220, 1]} />
    </Environment>
  )
}

// ---------------------------------------------------------------------------
// Build plate — clean blue grid baked into an unlit texture
// ---------------------------------------------------------------------------

// Precision coordinate surface — grid + ruler ticks aligned to the snap grid.
function makeGridTexture(bedX: number, bedY: number) {
  const k = Math.min(8, 4096 / Math.max(bedX, bedY))
  const W = Math.max(2, Math.round(bedX * k))
  const H = Math.max(2, Math.round(bedY * k))
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  const P = (mm: number) => mm * k
  const line = (sx: number, sy: number, ex: number, ey: number) => {
    g.beginPath()
    g.moveTo(sx, sy)
    g.lineTo(ex, ey)
    g.stroke()
  }

  g.fillStyle = '#f3f8ff'
  g.fillRect(0, 0, W, H)

  // minor grid (10 mm = snap increment)
  g.strokeStyle = '#d4e6fb'
  g.lineWidth = Math.max(1, k * 0.16)
  for (let x = 0; x <= bedX; x += 10) line(Math.round(P(x)) + 0.5, 0, Math.round(P(x)) + 0.5, H)
  for (let y = 0; y <= bedY; y += 10) line(0, Math.round(P(y)) + 0.5, W, Math.round(P(y)) + 0.5)

  // major grid (50 mm)
  g.strokeStyle = '#8db6f0'
  g.lineWidth = Math.max(1.5, k * 0.3)
  for (let x = 0; x <= bedX; x += 50) line(Math.round(P(x)) + 0.5, 0, Math.round(P(x)) + 0.5, H)
  for (let y = 0; y <= bedY; y += 50) line(0, Math.round(P(y)) + 0.5, W, Math.round(P(y)) + 0.5)

  // ruler ticks on every edge
  g.strokeStyle = '#1e40af'
  g.lineWidth = Math.max(1, k * 0.18)
  const mn = P(2)
  const mj = P(4.5)
  for (let x = 0; x <= bedX; x += 10) {
    const p = P(x)
    const L = x % 50 === 0 ? mj : mn
    line(p, 0, p, L)
    line(p, H, p, H - L)
  }
  for (let y = 0; y <= bedY; y += 10) {
    const p = P(y)
    const L = y % 50 === 0 ? mj : mn
    line(0, p, L, p)
    line(W, p, W - L, p)
  }

  // border + origin datum crosshair at (0,0)
  g.lineWidth = Math.max(2, k * 0.4)
  g.strokeRect(1, 1, W - 2, H - 2)
  g.strokeStyle = '#1d4ed8'
  g.lineWidth = Math.max(1.5, k * 0.3)
  line(0, 0, P(18), 0)
  line(0, 0, 0, P(18))
  g.fillStyle = '#1d4ed8'
  g.beginPath()
  g.arc(0, 0, P(2), 0, Math.PI * 2)
  g.fill()

  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function Bed({ bed }: { bed: BedSize }) {
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(bed.x, bed.z, bed.y)),
    [bed.x, bed.y, bed.z],
  )
  const gridTex = useMemo(() => makeGridTexture(bed.x, bed.y), [bed.x, bed.y])

  return (
    <group>
      <RoundedBox args={[bed.x + 6, 3, bed.y + 6]} radius={1} smoothness={3} position={[0, -1.5, 0]}>
        <meshStandardMaterial color="#aebfdc" roughness={0.85} metalness={0.08} />
      </RoundedBox>

      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[bed.x, bed.y]} />
        <meshBasicMaterial map={gridTex} toneMapped={false} />
      </mesh>

      <lineSegments geometry={edges} position={[0, bed.z / 2, 0]}>
        <lineBasicMaterial color="#93c5fd" transparent opacity={0.4} />
      </lineSegments>
    </group>
  )
}

// Numbered axes + datum, billboarded so they're always legible.
export function AxisLabels({ bed }: { bed: BedSize }) {
  const hx = bed.x / 2
  const hy = bed.y / 2
  const xs: number[] = []
  const ys: number[] = []
  for (let x = 50; x <= bed.x; x += 50) xs.push(x)
  for (let y = 50; y <= bed.y; y += 50) ys.push(y)
  const num =
    'rounded-[3px] bg-white/80 px-1 text-[10px] font-semibold leading-none text-blue-800 tabular-nums'

  return (
    <group>
      {xs.map((x) => (
        <Html key={`x${x}`} position={[x - hx, 0.5, hy + 9]} center style={{ pointerEvents: 'none' }}>
          <div className={num}>{x}</div>
        </Html>
      ))}
      {ys.map((y) => (
        <Html key={`y${y}`} position={[-hx - 9, 0.5, y - hy]} center style={{ pointerEvents: 'none' }}>
          <div className={num}>{y}</div>
        </Html>
      ))}
      <Html position={[-hx - 10, 0.5, -hy - 10]} center style={{ pointerEvents: 'none' }}>
        <div className="rounded bg-blue-600 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
          0,0
        </div>
      </Html>
      <Html position={[hx + 16, 0.5, hy + 9]} center style={{ pointerEvents: 'none' }}>
        <div className="text-[10px] font-bold text-blue-900">X mm</div>
      </Html>
      <Html position={[-hx - 9, 0.5, hy + 16]} center style={{ pointerEvents: 'none' }}>
        <div className="text-[10px] font-bold text-blue-900">Y mm</div>
      </Html>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Culture plate (STL)
// ---------------------------------------------------------------------------

interface PlateModelProps {
  model: PlateModelDef
  plate: Plate
  x: number
  y: number
  z: number
  hx: number
  hy: number
  /** Plate rotation (degrees CCW on the bed) — calibration may find it askew. */
  rotation: number
  outOfBounds: boolean
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
  onHover?: (over: boolean) => void
}

/** Culture plate — a loaded STL when available, otherwise a generated mesh. */
export function PlateModel(props: PlateModelProps) {
  return props.model.url ? <StlPlate {...props} /> : <GeneratedPlate {...props} />
}

/**
 * Machine +Y maps to the scene's +Z, which flips handedness — a counter-clockwise
 * rotation on the bed is a negative rotation about the scene's Y axis.
 */
function sceneYaw(rotationDeg: number): number {
  return (-rotationDeg * Math.PI) / 180
}

function StlPlate({ model, x, y, z, hx, hy, rotation, outOfBounds, onPointerDown, onHover }: PlateModelProps) {
  const geom = useLoader(STLLoader, model.url!)
  const prepared = useMemo(() => {
    const g = geom.clone()
    if (model.rotateX) g.rotateX(model.rotateX)
    g.computeVertexNormals()
    g.computeBoundingBox()
    const bb = g.boundingBox!
    // Normalize the mesh to its declared footprint so source units (some meshes
    // are authored in metres) and minor size variance don't matter.
    const sx = bb.max.x - bb.min.x
    const sy = bb.max.y - bb.min.y
    const sz = bb.max.z - bb.min.z
    if (sx > 0 && sy > 0 && sz > 0) {
      g.scale(model.width / sx, model.height / sy, model.depth / sz)
    }
    g.computeBoundingBox()
    const bb2 = g.boundingBox!
    g.translate(-bb2.min.x, -bb2.min.y, -bb2.min.z)
    return g
  }, [geom, model.rotateX, model.width, model.height, model.depth])

  return (
    <mesh
      geometry={prepared}
      position={[x - hx, z, y - hy]}
      rotation={[0, sceneYaw(rotation), 0]}
      onPointerDown={onPointerDown}
      onPointerOver={() => {
        if (onPointerDown) document.body.style.cursor = 'grab'
        onHover?.(true)
      }}
      onPointerOut={() => {
        if (onPointerDown) document.body.style.cursor = 'auto'
        onHover?.(false)
      }}
      castShadow
    >
      <meshPhysicalMaterial
        color={outOfBounds ? '#fca5a5' : '#dbe7f7'}
        roughness={0.22}
        metalness={0}
        clearcoat={0.85}
        clearcoatRoughness={0.14}
      />
    </mesh>
  )
}

// A dimensionally-accurate plate built from geometry (used for plates without an
// STL). Body = rounded box; wells = recessed circular openings in a landscape
// grid matching the app's coordinate system.
function GeneratedPlate({ model, plate, x, y, z, hx, hy, rotation, outOfBounds, onPointerDown, onHover }: PlateModelProps) {
  const { width, depth, height } = model
  const nX = Math.max(plate.rows, plate.cols)
  const nY = Math.min(plate.rows, plate.cols)
  const pitch = plate.pitch
  const wellR = plate.wellDiameter / 2
  const offX = (width - (nX - 1) * pitch) / 2
  const offY = (depth - (nY - 1) * pitch) / 2

  const wells = useMemo(() => {
    const out: [number, number][] = []
    for (let cy = 0; cy < nY; cy++)
      for (let cx = 0; cx < nX; cx++) out.push([offX + cx * pitch, offY + cy * pitch])
    return out
  }, [nX, nY, pitch, offX, offY])

  const bodyColor = outOfBounds ? '#fca5a5' : '#dbe7f7'
  const wellColor = outOfBounds ? '#ef9a9a' : '#aec4e2'
  const rimColor = outOfBounds ? '#e57373' : '#8ea8cd'

  return (
    <group
      position={[x - hx, z, y - hy]}
      rotation={[0, sceneYaw(rotation), 0]}
      onPointerDown={onPointerDown}
      onPointerOver={() => {
        if (onPointerDown) document.body.style.cursor = 'grab'
        onHover?.(true)
      }}
      onPointerOut={() => {
        if (onPointerDown) document.body.style.cursor = 'auto'
        onHover?.(false)
      }}
    >
      <RoundedBox args={[width, height, depth]} radius={2.5} smoothness={4} position={[width / 2, height / 2, depth / 2]} castShadow>
        <meshPhysicalMaterial color={bodyColor} roughness={0.22} metalness={0} clearcoat={0.85} clearcoatRoughness={0.14} />
      </RoundedBox>
      {wells.map(([wx, wy], i) => (
        <group key={i} position={[wx, height + 0.06, wy]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <circleGeometry args={[wellR, 40]} />
            <meshStandardMaterial color={wellColor} roughness={0.4} metalness={0} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <ringGeometry args={[wellR * 0.88, wellR, 40]} />
            <meshStandardMaterial color={rimColor} roughness={0.35} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Media / waste reservoir — glass rounded prism with tinted liquid
// ---------------------------------------------------------------------------

export type NozzleRef = React.MutableRefObject<{ x: number; y: number; z: number } | null>

// Real-time shallow-water surface: a height field whose ripples propagate and
// reflect off the walls. Container acceleration tilts it (slosh) and the pipette
// dimples it (drops). DAMP near 1 = low viscosity (long-lived, watery ripples).
const SIM_SEG = 14
const DAMP = 0.985 // closer to 1 = much less viscous (lively, water-like ripples)
const WAVE_SUBSTEPS = 2 // faster propagation per frame → thinner, runnier feel
const FORCE = 0.015 // slosh impulse per unit acceleration (small = not over-sloshy)
const ACCEL_CLAMP = 1200
const NOZZLE_DROP = 0.18

function Liquid({
  w,
  d,
  h,
  radius,
  cx,
  cz,
  mx,
  my,
  color,
  nozzleRef,
}: {
  w: number
  d: number
  h: number
  radius: number // matches the glass corner radius — for the rounded bottom
  cx: number
  cz: number
  mx: number // container near-corner X (machine mm) — for slosh + insertion
  my: number
  color: string
  nozzleRef?: NozzleRef
}) {
  // A liquid column that nearly spans the inside of the glass, lifted off the
  // floor so it reads as held by the walls.
  const lw = w * 0.84
  const ld = d * 0.84
  const baseY = h * 0.1
  const fillH = h * 0.42
  const maxH = fillH * 0.28 // small amplitude — surface stays near the rim, no reveal

  // Box geometry with a filleted (curved) bottom and a flat sharp top; the
  // top-ring vertices are driven by the height field each frame.
  const { geometry, topIdx, topCell, N, M } = useMemo(() => {
    const N = SIM_SEG + 1
    const M = SIM_SEG + 1
    // Plenty of height segments so the bottom fillet is a smooth curve, not a chamfer.
    const g = new THREE.BoxGeometry(lw, fillH, ld, SIM_SEG, 12, SIM_SEG)
    const pos = g.attributes.position
    // Round the bottom edges with a quarter-circle fillet matching the glass radius.
    const r = Math.min(radius, Math.min(lw, ld) / 2 - 0.1, fillH - 0.1)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const dd = y + fillH / 2 // height above the floor
      if (dd < r) {
        const inset = r - Math.sqrt(Math.max(0, r * r - (r - dd) * (r - dd)))
        pos.setX(i, x * ((lw / 2 - inset) / (lw / 2)))
        pos.setZ(i, z * ((ld / 2 - inset) / (ld / 2)))
      }
    }
    const topY = fillH / 2 - 1e-3
    const topIdx: number[] = []
    const topCell: number[] = []
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= topY) continue
      topIdx.push(i)
      const gi = Math.max(0, Math.min(N - 1, Math.round((pos.getX(i) / lw + 0.5) * (N - 1))))
      const gj = Math.max(0, Math.min(M - 1, Math.round((pos.getZ(i) / ld + 0.5) * (M - 1))))
      topCell.push(gi * M + gj)
    }
    g.computeVertexNormals()
    return { geometry: g, topIdx, topCell, N, M }
  }, [lw, fillH, ld, radius])

  const cur = useRef(new Float32Array(N * M))
  const prev = useRef(new Float32Array(N * M))
  const motion = useRef({ px: mx, py: my, vx: 0, vy: 0 })

  // Reset the field if the grid size changed.
  if (cur.current.length !== N * M) {
    cur.current = new Float32Array(N * M)
    prev.current = new Float32Array(N * M)
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30) || 1 / 60
    const mo = motion.current
    const vx = (mx - mo.px) / dt
    const vy = (my - mo.py) / dt
    const ax = THREE.MathUtils.clamp((vx - mo.vx) / dt, -ACCEL_CLAMP, ACCEL_CLAMP)
    const ay = THREE.MathUtils.clamp((vy - mo.vy) / dt, -ACCEL_CLAMP, ACCEL_CLAMP)
    mo.px = mx
    mo.py = my
    mo.vx = vx
    mo.vy = vy

    const c = cur.current
    const p = prev.current

    // Slosh forcing: liquid inertia piles it opposite to the acceleration.
    if (Math.abs(ax) > 1 || Math.abs(ay) > 1) {
      const fx = -ax * FORCE * dt
      const fz = -ay * FORCE * dt
      for (let i = 0; i < N; i++) {
        const nx = i / (N - 1) - 0.5
        for (let j = 0; j < M; j++) {
          const nz = j / (M - 1) - 0.5
          c[i * M + j] += fx * nx + fz * nz
        }
      }
    }

    // Pipette dimple — a moving drop where the tip enters the liquid.
    const nz = nozzleRef?.current
    if (nz && nz.x >= mx && nz.x <= mx + w && nz.y >= my && nz.y <= my + d && nz.z < h && nz.z > -3) {
      const gi = Math.max(0, Math.min(N - 1, Math.round(((nz.x - (mx + w / 2)) / lw + 0.5) * (N - 1))))
      const gj = Math.max(0, Math.min(M - 1, Math.round(((nz.y - (my + d / 2)) / ld + 0.5) * (M - 1))))
      c[gi * M + gj] -= NOZZLE_DROP
    }

    // Wave step (reflective walls via clamped neighbours) — Hugo Elias method.
    // Several sub-steps per frame make ripples propagate faster (low-viscosity feel).
    for (let s = 0; s < WAVE_SUBSTEPS; s++) {
      const cc = cur.current
      const pp = prev.current
      const at = (i: number, j: number) =>
        cc[(i < 0 ? 0 : i > N - 1 ? N - 1 : i) * M + (j < 0 ? 0 : j > M - 1 ? M - 1 : j)]
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const idx = i * M + j
          let v = (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1)) * 0.5 - pp[idx]
          v *= DAMP
          pp[idx] = v < -maxH ? -maxH : v > maxH ? maxH : v
        }
      }
      cur.current = pp
      prev.current = cc
    }

    // Push heights into the top surface vertices.
    const heights = cur.current
    const pos = geometry.attributes.position
    for (let k = 0; k < topIdx.length; k++) {
      pos.setY(topIdx[k], fillH / 2 + heights[topCell[k]])
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
  })

  return (
    <mesh geometry={geometry} position={[cx, baseY + fillH / 2, cz]}>
      <meshStandardMaterial color={color} roughness={0.12} metalness={0.12} emissive={color} emissiveIntensity={0.12} envMapIntensity={1.2} />
    </mesh>
  )
}

/** The Falcon-tube mesh (tube + round stand), normalized to the deck footprint. */
function FalconTube({
  cx,
  cz,
  w,
  d,
  h,
  outOfBounds,
}: {
  cx: number
  cz: number
  w: number
  d: number
  h: number
  outOfBounds: boolean
}) {
  const geom = useLoader(STLLoader, RESERVOIR_MODEL.url)
  const prepared = useMemo(() => {
    const g = geom.clone()
    g.rotateX(RESERVOIR_MODEL.rotateX)
    g.computeVertexNormals()
    g.computeBoundingBox()
    const bb = g.boundingBox!
    const sx = bb.max.x - bb.min.x
    const sy = bb.max.y - bb.min.y
    const sz = bb.max.z - bb.min.z
    if (sx > 0 && sy > 0 && sz > 0) g.scale(w / sx, h / sy, d / sz)
    g.computeBoundingBox()
    const bb2 = g.boundingBox!
    // Centre the footprint on the origin so the group can sit at (cx, cz).
    g.translate(-(bb2.min.x + bb2.max.x) / 2, -bb2.min.y, -(bb2.min.z + bb2.max.z) / 2)
    return g
  }, [geom, w, d, h])

  return (
    <mesh geometry={prepared} position={[cx, 0, cz]} castShadow>
      <meshPhysicalMaterial
        color={outOfBounds ? '#fca5a5' : '#eaf2ff'}
        roughness={0.08}
        metalness={0}
        transparent
        opacity={0.32}
        depthWrite={false}
        ior={1.45}
        clearcoat={1}
        clearcoatRoughness={0.05}
        envMapIntensity={1.6}
      />
    </mesh>
  )
}

/**
 * Liquid column standing in the tube's bore. The surface bobs gently and dips
 * when the pipette enters, standing in for the box-shaped slosh sim that suited
 * the old rectangular reservoirs.
 */
function TubeLiquid({
  cx,
  cz,
  floor,
  bore,
  height,
  color,
  mx,
  my,
  nozzleRef,
}: {
  cx: number
  cz: number
  floor: number
  bore: number
  height: number
  color: string
  mx: number
  my: number
  nozzleRef?: NozzleRef
}) {
  const body = useRef<THREE.Mesh>(null!)
  // Fill the lower half of the bore — enough to read as "full" from any angle.
  const fill = (height - floor) * 0.45
  const r = bore * 0.92

  // One mesh, scaled from its base, so there's no surface disc to z-fight with
  // the cylinder cap. The level breathes gently and drops while the tip is in.
  useFrame((state) => {
    if (!body.current) return
    const t = state.clock.elapsedTime
    const n = nozzleRef?.current
    const inside =
      n &&
      Math.hypot(n.x - (mx + RESERVOIR.width / 2), n.y - (my + RESERVOIR.depth / 2)) < bore &&
      n.z < floor + fill + 12
    const level = 1 + Math.sin(t * 1.6) * 0.004 + (inside ? -0.02 : 0)
    body.current.scale.y = level
    body.current.position.y = (fill * level) / 2
  })

  return (
    <group position={[cx, floor, cz]}>
      <mesh ref={body} position={[0, fill / 2, 0]}>
        <cylinderGeometry args={[r, r * 0.86, fill, 32]} />
        <meshStandardMaterial color={color} roughness={0.15} metalness={0.12} emissive={color} emissiveIntensity={0.14} />
      </mesh>
    </group>
  )
}

export function Reservoir({
  x,
  y,
  hx,
  hy,
  height: h,
  color,
  outOfBounds,
  onPointerDown,
  onHover,
  nozzleRef,
}: {
  x: number
  y: number
  hx: number
  hy: number
  height: number
  color: string
  outOfBounds: boolean
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
  onHover?: (over: boolean) => void
  nozzleRef?: NozzleRef
}) {
  const { width: w, depth: d, bore, floor } = RESERVOIR
  const cx = x + w / 2 - hx
  const cz = y + d / 2 - hy
  const tint = outOfBounds ? '#ef4444' : color

  return (
    <group
      onPointerDown={onPointerDown}
      onPointerOver={() => {
        if (onPointerDown) document.body.style.cursor = 'grab'
        onHover?.(true)
      }}
      onPointerOut={() => {
        if (onPointerDown) document.body.style.cursor = 'auto'
        onHover?.(false)
      }}
    >
      <TubeLiquid cx={cx} cz={cz} floor={floor} bore={bore} height={h} color={tint} mx={x} my={y} nozzleRef={nozzleRef} />
      <Suspense fallback={null}>
        <FalconTube cx={cx} cz={cz} w={w} d={d} h={h} outOfBounds={outOfBounds} />
      </Suspense>

      {/* Toolhead target — the (x, y) centre the pipette dips into */}
      <mesh position={[cx, h + 2, cz]}>
        <sphereGeometry args={[1.7, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.3} metalness={0.1} />
      </mesh>
      <group position={[cx, 0.32, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[1.7, 2.5, 28]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.95} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[0.85, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  )
}

function ObjectLabel({
  cx,
  cz,
  height,
  text,
  tone,
  active,
  coords,
}: {
  cx: number
  cz: number
  height: number
  text: string
  tone: 'plate' | 'fresh' | 'waste'
  active?: boolean
  coords?: string
}) {
  const dot = tone === 'plate' ? '#2563eb' : tone === 'fresh' ? '#ec4899' : '#475569'
  return (
    <Html position={[cx, height + 16, cz]} center style={{ pointerEvents: 'none' }} zIndexRange={[120, 0]}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-white/95 shadow-sm transition-all duration-150 ease-out',
          active
            ? '-translate-y-1.5 scale-105 border-primary/40 shadow-lift'
            : 'border-border',
        )}
      >
        <div className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold text-foreground">
          <span className="size-1.5 rounded-full" style={{ background: dot }} />
          {text}
        </div>
        <div
          className={cn(
            'whitespace-nowrap px-2.5 font-mono text-[10px] tabular-nums text-muted-foreground transition-all duration-150 ease-out',
            active ? 'max-h-5 pb-1 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          {coords}
        </div>
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------------------
// Drag controller (must live inside <Canvas>)
// ---------------------------------------------------------------------------

function DragController({
  dragging,
  offsetRef,
  footprint,
  bed,
  snap,
  onEnd,
}: {
  dragging: DeckObjectKey | null
  offsetRef: React.MutableRefObject<{ x: number; y: number }>
  footprint: { w: number; d: number }
  bed: BedSize
  snap: boolean
  onEnd: () => void
}) {
  const { camera, raycaster, pointer } = useThree()
  const setDeckObject = useStore((s) => s.setDeckObject)
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!dragging) return
    raycaster.setFromCamera(pointer, camera)
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    let x = clamp(hit.x + bed.x / 2 - offsetRef.current.x, 0, bed.x - footprint.w)
    let y = clamp(hit.z + bed.y / 2 - offsetRef.current.y, 0, bed.y - footprint.d)
    if (snap) {
      x = clamp(snapValue(x), 0, bed.x - footprint.w)
      y = clamp(snapValue(y), 0, bed.y - footprint.d)
    }
    x = Math.round(x * 10) / 10
    y = Math.round(y * 10) / 10
    const cur = useStore.getState().deck[dragging]
    if (cur.x === x && cur.y === y) return
    setDeckObject(dragging, { x, y })
  })

  useEffect(() => {
    if (!dragging) return
    const up = () => {
      document.body.style.cursor = 'auto'
      onEnd()
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [dragging, onEnd])

  return null
}

// ---------------------------------------------------------------------------
// Camera presets + orientation gizmo
// ---------------------------------------------------------------------------

export type ViewPreset = 'iso' | 'top' | 'front'
export interface ViewApi {
  setView: (preset: ViewPreset) => void
}

function presetPose(preset: ViewPreset, bed: BedSize) {
  const D = Math.max(bed.x, bed.y)
  if (preset === 'top')
    return { pos: new THREE.Vector3(0, D * 1.85, 0.001), target: new THREE.Vector3(0, 0, 0) }
  if (preset === 'front')
    return { pos: new THREE.Vector3(0, D * 0.5, D * 1.78), target: new THREE.Vector3(0, 6, 0) }
  return { pos: new THREE.Vector3(-D * 0.66, D * 0.92, D * 1.17), target: new THREE.Vector3(0, 6, 0) }
}

// Smoothly flies the camera to a requested preset pose. Lives inside <Canvas>.
function CameraRig({ apiRef, bed }: { apiRef?: React.MutableRefObject<ViewApi | null>; bed: BedSize }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null
  const desired = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      setView: (preset) => {
        desired.current = presetPose(preset, bed)
      },
    }
    return () => {
      if (apiRef) apiRef.current = null
    }
  }, [apiRef, bed])

  useFrame(() => {
    const d = desired.current
    if (!d) return
    camera.position.lerp(d.pos, 0.16)
    if (controls) {
      controls.target.lerp(d.target, 0.16)
      controls.update()
    }
    if (camera.position.distanceTo(d.pos) < 0.6) desired.current = null
  })

  return null
}

// Flat translucent footprint + outline showing where a dragged object will land.
function DragGhost({
  x,
  y,
  w,
  d,
  hx,
  hy,
  color,
}: {
  x: number
  y: number
  w: number
  d: number
  hx: number
  hy: number
  color: string
}) {
  const cx = x + w / 2 - hx
  const cz = y + d / 2 - hy
  const pts = useMemo<[number, number, number][]>(() => {
    const ax = w / 2
    const az = d / 2
    return [
      [-ax, 0, -az],
      [ax, 0, -az],
      [ax, 0, az],
      [-ax, 0, az],
      [-ax, 0, -az],
    ]
  }, [w, d])
  return (
    <group position={[cx, 0.45, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={pts} color={color} lineWidth={1.6} dashed dashSize={4} gapSize={2.5} />
    </group>
  )
}

// Flat dimension lines on the bed measuring gaps to walls + facing objects.
function ClearanceDims3D({
  af,
  others,
  bed,
  hx,
  hy,
}: {
  af: Footprint
  others: Footprint[]
  bed: BedSize
  hx: number
  hy: number
}) {
  const dims = clearances(af, others, bed)
  const yL = 0.7

  // Fade the lines + labels in on mount (and whenever the active object changes,
  // since the parent keys this component on the active key).
  const [fade, setFade] = useState(0)
  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const f = Math.min((t - start) / 170, 1)
      setFade(f)
      if (f < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <group>
      {dims.map((d, i) => {
        const color = d.kind === 'object' ? '#f59e0b' : '#64748b'
        let p1: [number, number, number]
        let p2: [number, number, number]
        let mid: [number, number, number]
        if (d.axis === 'x') {
          p1 = [d.a - hx, yL, d.at - hy]
          p2 = [d.b - hx, yL, d.at - hy]
          mid = [(d.a + d.b) / 2 - hx, yL, d.at - hy]
        } else {
          p1 = [d.at - hx, yL, d.a - hy]
          p2 = [d.at - hx, yL, d.b - hy]
          mid = [d.at - hx, yL, (d.a + d.b) / 2 - hy]
        }
        return (
          <group key={i}>
            <Line points={[p1, p2]} color={color} lineWidth={1.4} transparent opacity={fade} />
            <Html position={mid} center style={{ pointerEvents: 'none' }} zIndexRange={[60, 0]}>
              <div
                className="rounded bg-white/95 px-1 py-0.5 text-[10px] font-bold tabular-nums shadow-sm"
                style={{ color, opacity: fade }}
              >
                {d.gap.toFixed(d.gap < 10 ? 1 : 0)}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function PrinterWorkspace({
  viewApiRef,
}: {
  viewApiRef?: React.MutableRefObject<ViewApi | null>
}) {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const snap = useStore((s) => s.snapToGrid)
  const plateType = useStore((s) => s.plateType)
  const setActiveDeckTab = useStore((s) => s.setActiveDeckTab)
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const hx = bed.x / 2
  const hy = bed.y / 2

  const [dragging, setDragging] = useState<DeckObjectKey | null>(null)
  const [hovered, setHovered] = useState<DeckObjectKey | null>(null)
  const offsetRef = useRef({ x: 0, y: 0 })

  const setHover = (key: DeckObjectKey) => (over: boolean) =>
    setHovered((c) => (over ? key : c === key ? null : c))

  const plateF = plateFootprint(deck, plate)
  const freshF = reservoirFootprint(deck.freshMedia)
  const wasteF = reservoirFootprint(deck.waste)

  const fpByKey: Record<DeckObjectKey, Footprint> = {
    plate: plateF,
    freshMedia: freshF,
    waste: wasteF,
  }
  const activeKey = dragging ?? hovered

  const n = (v: number) => v.toFixed(1)
  const plateCoords = `X${n(deck.plate.x)} Y${n(deck.plate.y)} Z${n(deck.plate.z)}`
  const freshCoords = `X${n(freshF.x + freshF.w / 2)} Y${n(freshF.y + freshF.d / 2)}`
  const wasteCoords = `X${n(wasteF.x + wasteF.w / 2)} Y${n(wasteF.y + wasteF.d / 2)}`

  const beginDrag =
    (key: DeckObjectKey, min: { x: number; y: number }) =>
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setActiveDeckTab(key)
      offsetRef.current = { x: e.point.x + hx - min.x, y: e.point.z + hy - min.y }
      document.body.style.cursor = 'grabbing'
      setDragging(key)
    }

  const dragFootprint =
    dragging === 'plate'
      ? { w: model.width, d: model.depth }
      : { w: RESERVOIR.width, d: RESERVOIR.depth }

  const toneColor = (key: DeckObjectKey) =>
    key === 'plate' ? '#2563eb' : key === 'freshMedia' ? '#ec4899' : '#475569'

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
          <PlateModel
            model={model}
            plate={plate}
            rotation={deck.plate.rotation}
            x={deck.plate.x}
            y={deck.plate.y}
            z={deck.plate.z}
            hx={hx}
            hy={hy}
            outOfBounds={!withinBed(plateF, bed)}
            onPointerDown={beginDrag('plate', { x: deck.plate.x, y: deck.plate.y })}
            onHover={setHover('plate')}
          />
        </Suspense>

        <Reservoir x={deck.freshMedia.x} y={deck.freshMedia.y} hx={hx} hy={hy} height={deck.freshMedia.height} color="#ec4899" outOfBounds={!withinBed(freshF, bed)} onPointerDown={beginDrag('freshMedia', deck.freshMedia)} onHover={setHover('freshMedia')} />
        <Reservoir x={deck.waste.x} y={deck.waste.y} hx={hx} hy={hy} height={deck.waste.height} color="#475569" outOfBounds={!withinBed(wasteF, bed)} onPointerDown={beginDrag('waste', deck.waste)} onHover={setHover('waste')} />

        <ObjectLabel cx={plateF.x + plateF.w / 2 - hx} cz={plateF.y + plateF.d / 2 - hy} height={deck.plate.z + model.height} text={`Culture Plate · ${plate.wellCount}-well`} tone="plate" active={hovered === 'plate'} coords={plateCoords} />
        <ObjectLabel cx={freshF.x + freshF.w / 2 - hx} cz={freshF.y + freshF.d / 2 - hy} height={deck.freshMedia.height} text="Fresh Media" tone="fresh" active={hovered === 'freshMedia'} coords={freshCoords} />
        <ObjectLabel cx={wasteF.x + wasteF.w / 2 - hx} cz={wasteF.y + wasteF.d / 2 - hy} height={deck.waste.height} text="Waste" tone="waste" active={hovered === 'waste'} coords={wasteCoords} />

        {dragging && (
          <DragGhost
            x={deck[dragging].x}
            y={deck[dragging].y}
            w={dragFootprint.w}
            d={dragFootprint.d}
            hx={hx}
            hy={hy}
            color={toneColor(dragging)}
          />
        )}

        {activeKey && (
          <ClearanceDims3D
            key={activeKey}
            af={fpByKey[activeKey]}
            others={OBJECT_KEYS.filter((k) => k !== activeKey).map((k) => fpByKey[k])}
            bed={bed}
            hx={hx}
            hy={hy}
          />
        )}

        <ContactShadows position={[0, 0.14, 0]} scale={Math.max(bed.x, bed.y) * 1.5} blur={2.4} far={70} opacity={0.18} color="#1e3a8a" />
      </Suspense>

      <OrbitControls
        makeDefault
        enabled={!dragging}
        target={[0, 6, 0]}
        enablePan
        enableZoom
        minDistance={120}
        maxDistance={1200}
        maxPolarAngle={Math.PI / 2.04}
      />
      <CameraRig apiRef={viewApiRef} bed={bed} />
      <GizmoHelper alignment="bottom-right" margin={[64, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#1e293b" />
      </GizmoHelper>
      <DragController dragging={dragging} offsetRef={offsetRef} footprint={dragFootprint} bed={bed} snap={snap} onEnd={() => setDragging(null)} />
    </Canvas>
  )
}
