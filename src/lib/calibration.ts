import type { DeckConfig, Plate } from '@/types'
import {
  PLATE_MODELS,
  RESERVOIR,
  defaultClearanceZ,
  type PlateModelDef,
} from '@/lib/deck'

export type CalKey = 'well-tl' | 'well-br' | 'fresh' | 'waste' | 'clearance'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CalStep {
  key: CalKey
  label: string
  short: string
  instruction: string
  /**
   * 'plate' steps reposition the plate; 'reservoir' steps move a container;
   * 'clearance' fixes the safe travel height above every object.
   */
  group: 'plate' | 'reservoir' | 'clearance'
}

export const CAL_STEPS: CalStep[] = [
  {
    key: 'well-tl',
    label: 'Top-Left Well',
    short: 'TL',
    group: 'plate',
    instruction:
      'Jog the nozzle to the CENTRE of the TOP-LEFT well, then lower it until it sits just above the well bottom. This diagonal pair fixes every well on the plate.',
  },
  {
    key: 'well-br',
    label: 'Bottom-Right Well',
    short: 'BR',
    group: 'plate',
    instruction:
      'Jog to the CENTRE of the opposite BOTTOM-RIGHT well and lower to just above the well bottom.',
  },
  {
    key: 'fresh',
    label: 'Fresh Media',
    short: 'Media',
    group: 'reservoir',
    instruction:
      'Centre the pipette over the fresh-media tube, then lower it down the bore until it just touches the bottom. This is how deep it dips to draw liquid.',
  },
  {
    key: 'waste',
    label: 'Waste',
    short: 'Waste',
    group: 'reservoir',
    instruction:
      'Centre the pipette over the waste tube and lower it down the bore until it just touches the bottom.',
  },
  {
    key: 'clearance',
    label: 'Travel Clearance',
    short: 'Clear',
    group: 'clearance',
    instruction:
      'Raise Z until the pipette tip clears the tube mouths and the plate with room to spare, then set it. Every move between the tubes and the plate happens at this height.',
  },
]

// The plate's physical wells are laid out landscape (matching the STL): the
// larger count runs along X. Compute the corner-well offsets within the plate.
function wellGrid(plate: Plate, model: PlateModelDef) {
  const nX = Math.max(plate.rows, plate.cols)
  const nY = Math.min(plate.rows, plate.cols)
  const gw = (nX - 1) * plate.pitch
  const gh = (nY - 1) * plate.pitch
  return {
    nX,
    nY,
    offX: (model.width - gw) / 2,
    offY: (model.depth - gh) / 2,
    gw,
    gh,
  }
}

/** The model's current best guess for each target — used to guide the user. */
export function calTargets(
  deck: DeckConfig,
  plate: Plate,
  model: PlateModelDef,
): Record<CalKey, Vec3> {
  const wg = wellGrid(plate, model)
  const corner = (col: number, row: number): Vec3 => ({
    x: deck.plate.x + wg.offX + col * plate.pitch,
    y: deck.plate.y + wg.offY + row * plate.pitch,
    z: deck.plate.z,
  })
  return {
    'well-tl': corner(0, 0),
    'well-br': corner(wg.nX - 1, wg.nY - 1),
    fresh: {
      x: deck.freshMedia.x + RESERVOIR.width / 2,
      y: deck.freshMedia.y + RESERVOIR.depth / 2,
      z: RESERVOIR.floor,
    },
    waste: {
      x: deck.waste.x + RESERVOIR.width / 2,
      y: deck.waste.y + RESERVOIR.depth / 2,
      z: RESERVOIR.floor,
    },
    // Clearance is a height, not a place — guide the user above the fresh tube.
    clearance: {
      x: deck.freshMedia.x + RESERVOIR.width / 2,
      y: deck.freshMedia.y + RESERVOIR.depth / 2,
      z: defaultClearanceZ(deck, plate.height),
    },
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10

export interface CalibrationResult {
  plate?: { x: number; y: number; z: number }
  freshMedia?: { x: number; y: number }
  waste?: { x: number; y: number }
  /** Nozzle Z at the well bottom — the safe pipetting depth to bake into G-code. */
  nozzleZ?: number
  /** Nozzle Z at each tube's floor — how far the pipette dips to reach liquid. */
  freshZ?: number
  wasteZ?: number
  /** Safe Z for XY travel, clearing the tube mouths and the plate. */
  travelZ?: number
}

/**
 * Back-project captured nozzle positions into deck placement. Two diagonal
 * corner wells (top-left + bottom-right) fix the plate origin (averaged from
 * both) and the nozzle Z; every other well is then interpolated from the plate
 * geometry. Reservoir captures (taken at the container centre) fix their
 * footprints.
 */
export function computeDeckFromCalibration(
  captured: Partial<Record<CalKey, Vec3>>,
  plate: Plate,
  model: PlateModelDef = PLATE_MODELS[plate.type],
): CalibrationResult {
  const wg = wellGrid(plate, model)
  const out: CalibrationResult = {}
  const { 'well-tl': tl, 'well-br': br } = captured

  if (tl && br) {
    // tl sits at grid (0,0); br at the opposite corner (offset by gw, gh).
    const px = (tl.x - wg.offX + (br.x - wg.offX - wg.gw)) / 2
    const py = (tl.y - wg.offY + (br.y - wg.offY - wg.gh)) / 2
    const pz = (tl.z + br.z) / 2
    out.plate = { x: r1(px), y: r1(py), z: r1(pz) }
    out.nozzleZ = r1(pz)
  }
  if (captured.fresh) {
    out.freshMedia = {
      x: r1(captured.fresh.x - RESERVOIR.width / 2),
      y: r1(captured.fresh.y - RESERVOIR.depth / 2),
    }
    out.freshZ = r1(captured.fresh.z)
  }
  if (captured.waste) {
    out.waste = {
      x: r1(captured.waste.x - RESERVOIR.width / 2),
      y: r1(captured.waste.y - RESERVOIR.depth / 2),
    }
    out.wasteZ = r1(captured.waste.z)
  }
  if (captured.clearance) out.travelZ = r1(captured.clearance.z)
  return out
}
