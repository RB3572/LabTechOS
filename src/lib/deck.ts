import type { BedSize, DeckConfig, ObjectStatus, Plate, PlateType } from '@/types'

// ---------------------------------------------------------------------------
// Machine constants (millimetres)
// ---------------------------------------------------------------------------

/** Default printable build volume of the CS-4000 deck (user-configurable). */
export const BED: BedSize = { x: 256, y: 256, z: 220 }

/** Media / waste reservoirs are modelled as a rounded rectangular prism. */
export const RESERVOIR = { width: 30, depth: 20, height: 34, radius: 4 }

/** Objects closer than this (mm) raise a proximity warning. */
export const PROXIMITY_THRESHOLD = 15

/** Grid spacing used by snap-to-grid (matches the minor grid lines). */
export const GRID_SNAP = 10

export function snapValue(v: number): number {
  return Math.round(v / GRID_SNAP) * GRID_SNAP
}

// ---------------------------------------------------------------------------
// Plate STL models — real footprints measured from the supplied meshes.
// `rotateX` re-orients the mesh so its height runs along the +Y (up) axis.
// ---------------------------------------------------------------------------

export interface PlateModelDef {
  url: string
  /** Footprint width (X) and depth (Y) and overall height (Z), millimetres. */
  width: number
  depth: number
  height: number
  /** Rotation (radians) about X applied to the loaded geometry to make it Y-up. */
  rotateX: number
}

export const PLATE_MODELS: Record<PlateType, PlateModelDef> = {
  '24-well': {
    url: '/models/plate-24well.stl',
    width: 127.89,
    depth: 85.6,
    height: 20.02,
    rotateX: 0,
  },
  '96-well': {
    url: '/models/plate-96well.stl',
    width: 127.64,
    depth: 85.6,
    height: 14.4,
    rotateX: -Math.PI / 2,
  },
}

// ---------------------------------------------------------------------------
// Footprints — axis-aligned rectangles on the bed
// ---------------------------------------------------------------------------

export interface Footprint {
  x: number
  y: number
  w: number
  d: number
}

export function plateFootprint(deck: DeckConfig, plate: Plate): Footprint {
  const { width, depth } = PLATE_MODELS[plate.type]
  return { x: deck.plate.x, y: deck.plate.y, w: width, d: depth }
}

export function reservoirFootprint(pos: { x: number; y: number }): Footprint {
  return { x: pos.x, y: pos.y, w: RESERVOIR.width, d: RESERVOIR.depth }
}

export type ClearanceKind = 'wall' | 'object'
export interface ClearanceDim {
  axis: 'x' | 'y' // axis the gap is measured along
  a: number // gap start along that axis
  b: number // gap end along that axis
  at: number // perpendicular coordinate the dimension line sits on
  gap: number // b - a
  kind: ClearanceKind
}

const MIN_CLEARANCE = 0.5

/**
 * Measured gaps from `active` to the bed walls (all four sides) and to any
 * `others` it directly faces (footprints overlapping on the perpendicular
 * axis). Used to draw dimension lines while hovering or dragging.
 */
export function clearances(
  active: Footprint,
  others: Footprint[],
  bed: { x: number; y: number },
): ClearanceDim[] {
  const out: ClearanceDim[] = []
  const cx = active.x + active.w / 2
  const cy = active.y + active.d / 2

  // Bed-wall gaps
  if (active.x > MIN_CLEARANCE)
    out.push({ axis: 'x', a: 0, b: active.x, at: cy, gap: active.x, kind: 'wall' })
  const right = bed.x - (active.x + active.w)
  if (right > MIN_CLEARANCE)
    out.push({ axis: 'x', a: active.x + active.w, b: bed.x, at: cy, gap: right, kind: 'wall' })
  if (active.y > MIN_CLEARANCE)
    out.push({ axis: 'y', a: 0, b: active.y, at: cx, gap: active.y, kind: 'wall' })
  const bottom = bed.y - (active.y + active.d)
  if (bottom > MIN_CLEARANCE)
    out.push({ axis: 'y', a: active.y + active.d, b: bed.y, at: cx, gap: bottom, kind: 'wall' })

  // Edge-to-edge gaps to facing objects
  for (const o of others) {
    const yOverlap = Math.min(active.y + active.d, o.y + o.d) - Math.max(active.y, o.y)
    if (yOverlap > MIN_CLEARANCE) {
      const at = (Math.max(active.y, o.y) + Math.min(active.y + active.d, o.y + o.d)) / 2
      if (o.x >= active.x + active.w) {
        const gap = o.x - (active.x + active.w)
        if (gap > MIN_CLEARANCE) out.push({ axis: 'x', a: active.x + active.w, b: o.x, at, gap, kind: 'object' })
      } else if (o.x + o.w <= active.x) {
        const gap = active.x - (o.x + o.w)
        if (gap > MIN_CLEARANCE) out.push({ axis: 'x', a: o.x + o.w, b: active.x, at, gap, kind: 'object' })
      }
    }
    const xOverlap = Math.min(active.x + active.w, o.x + o.w) - Math.max(active.x, o.x)
    if (xOverlap > MIN_CLEARANCE) {
      const at = (Math.max(active.x, o.x) + Math.min(active.x + active.w, o.x + o.w)) / 2
      if (o.y >= active.y + active.d) {
        const gap = o.y - (active.y + active.d)
        if (gap > MIN_CLEARANCE) out.push({ axis: 'y', a: active.y + active.d, b: o.y, at, gap, kind: 'object' })
      } else if (o.y + o.d <= active.y) {
        const gap = active.y - (o.y + o.d)
        if (gap > MIN_CLEARANCE) out.push({ axis: 'y', a: o.y + o.d, b: active.y, at, gap, kind: 'object' })
      }
    }
  }

  return out
}

/** Whether a footprint is fully inside the printable area. */
export function withinBed(f: Footprint, bed: BedSize): boolean {
  return f.x >= 0 && f.y >= 0 && f.x + f.w <= bed.x && f.y + f.d <= bed.y
}

function overlaps(a: Footprint, b: Footprint): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.d &&
    b.y < a.y + a.d
  )
}

/** Shortest gap (mm) between two footprints; 0 when they overlap or touch. */
function gap(a: Footprint, b: Footprint): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w))
  const dy = Math.max(0, b.y - (a.y + a.d), a.y - (b.y + b.d))
  return Math.hypot(dx, dy)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID: ObjectStatus = { level: 'valid', label: 'Configuration Valid' }

export interface DeckValidation {
  plate: ObjectStatus
  freshMedia: ObjectStatus
  waste: ObjectStatus
  /** Human-readable blocking + advisory issues, most severe first. */
  issues: { level: 'warning' | 'error'; message: string }[]
  /** True only when nothing blocks G-code generation. */
  canGenerate: boolean
}

/**
 * Continuously validate the physical configuration: a plate must be
 * configured, fresh media + waste must fit the bed without collisions, and
 * everything must stay inside the printable area.
 */
export function validateDeck(
  deck: DeckConfig,
  plate: Plate,
  plateConfigured: boolean,
  bed: BedSize,
): DeckValidation {
  const plateF = plateFootprint(deck, plate)
  const freshF = reservoirFootprint(deck.freshMedia)
  const wasteF = reservoirFootprint(deck.waste)

  const issues: DeckValidation['issues'] = []

  // The plate object only cares about staying in bounds.
  let plateStatus: ObjectStatus = VALID
  if (!withinBed(plateF, bed)) {
    plateStatus = { level: 'error', label: 'Out of Bounds' }
    issues.push({ level: 'error', message: 'Culture plate extends beyond the printable area.' })
  }

  // Reservoirs check bounds, then collisions, then proximity to the plate.
  const reservoirStatus = (
    name: string,
    self: Footprint,
    height: number,
    others: { label: string; f: Footprint }[],
  ): ObjectStatus => {
    if (!withinBed(self, bed)) {
      issues.push({ level: 'error', message: `${name} extends beyond the printable area.` })
      return { level: 'error', label: 'Out of Bounds' }
    }
    if (height > bed.z) {
      issues.push({ level: 'error', message: `${name} is taller than the build height.` })
      return { level: 'error', label: 'Exceeds Build Height' }
    }
    const hit = others.find((o) => overlaps(self, o.f))
    if (hit) {
      issues.push({ level: 'error', message: `${name} overlaps the ${hit.label}.` })
      return { level: 'error', label: 'Collision' }
    }
    const near = others.some((o) => gap(self, o.f) < PROXIMITY_THRESHOLD)
    if (near) {
      issues.push({ level: 'warning', message: `${name} is close to another object.` })
      return { level: 'warning', label: 'Proximity Warning' }
    }
    return VALID
  }

  const freshStatus = reservoirStatus('Fresh media', freshF, deck.freshMedia.height, [
    { label: 'culture plate', f: plateF },
    { label: 'waste hub', f: wasteF },
  ])
  const wasteStatus = reservoirStatus('Waste hub', wasteF, deck.waste.height, [
    { label: 'culture plate', f: plateF },
    { label: 'fresh media', f: freshF },
  ])

  if (!plateConfigured) {
    issues.unshift({
      level: 'error',
      message: 'Configure a plate and protocol in Plate Routine before generating G-Code.',
    })
  }

  const hasError = issues.some((i) => i.level === 'error')

  return {
    plate: plateStatus,
    freshMedia: freshStatus,
    waste: wasteStatus,
    issues,
    canGenerate: plateConfigured && !hasError,
  }
}
