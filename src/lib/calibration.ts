import type { DeckConfig, Plate } from '@/types'
import { PLATE_MODELS, RESERVOIR, type PlateModelDef } from '@/lib/deck'

export type CalKey =
  | 'well-tl'
  | 'well-tr'
  | 'well-bl'
  | 'well-br'
  | 'fresh'
  | 'waste'

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
  /** 'plate' steps reposition the plate; 'reservoir' steps move a container. */
  group: 'plate' | 'reservoir'
}

export const CAL_STEPS: CalStep[] = [
  {
    key: 'well-tl',
    label: 'Top-Left Well',
    short: 'TL',
    group: 'plate',
    instruction:
      'Jog the nozzle to the centre of the TOP-LEFT well, then lower it until it sits just above the well bottom.',
  },
  {
    key: 'well-tr',
    label: 'Top-Right Well',
    short: 'TR',
    group: 'plate',
    instruction:
      'Jog to the centre of the TOP-RIGHT well and lower to just above the well bottom.',
  },
  {
    key: 'well-bl',
    label: 'Bottom-Left Well',
    short: 'BL',
    group: 'plate',
    instruction:
      'Jog to the centre of the BOTTOM-LEFT well and lower to just above the well bottom.',
  },
  {
    key: 'well-br',
    label: 'Bottom-Right Well',
    short: 'BR',
    group: 'plate',
    instruction:
      'Jog to the centre of the BOTTOM-RIGHT well and lower to just above the well bottom.',
  },
  {
    key: 'fresh',
    label: 'Fresh Media',
    short: 'Media',
    group: 'reservoir',
    instruction:
      'Jog to the centre of the fresh-media container and lower the pipette to its bottom.',
  },
  {
    key: 'waste',
    label: 'Waste',
    short: 'Waste',
    group: 'reservoir',
    instruction:
      'Jog to the centre of the waste container and lower the pipette to its bottom.',
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
    'well-tr': corner(wg.nX - 1, 0),
    'well-bl': corner(0, wg.nY - 1),
    'well-br': corner(wg.nX - 1, wg.nY - 1),
    fresh: {
      x: deck.freshMedia.x + RESERVOIR.width / 2,
      y: deck.freshMedia.y + RESERVOIR.depth / 2,
      z: 2,
    },
    waste: {
      x: deck.waste.x + RESERVOIR.width / 2,
      y: deck.waste.y + RESERVOIR.depth / 2,
      z: 2,
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
}

/**
 * Back-project captured nozzle positions into deck placement. The 4 corner
 * wells fix the plate origin (averaged) and the nozzle Z; the reservoir
 * captures (taken at the container centre) fix their footprints.
 */
export function computeDeckFromCalibration(
  captured: Partial<Record<CalKey, Vec3>>,
  plate: Plate,
  model: PlateModelDef = PLATE_MODELS[plate.type],
): CalibrationResult {
  const wg = wellGrid(plate, model)
  const out: CalibrationResult = {}
  const { 'well-tl': tl, 'well-tr': tr, 'well-bl': bl, 'well-br': br } = captured

  if (tl && tr && bl && br) {
    const px =
      (tl.x - wg.offX + (tr.x - (wg.offX + wg.gw)) + (bl.x - wg.offX) + (br.x - (wg.offX + wg.gw))) /
      4
    const py =
      (tl.y - wg.offY + (tr.y - wg.offY) + (bl.y - (wg.offY + wg.gh)) + (br.y - (wg.offY + wg.gh))) /
      4
    const pz = (tl.z + tr.z + bl.z + br.z) / 4
    out.plate = { x: r1(px), y: r1(py), z: r1(pz) }
    out.nozzleZ = r1(pz)
  }
  if (captured.fresh) {
    out.freshMedia = {
      x: r1(captured.fresh.x - RESERVOIR.width / 2),
      y: r1(captured.fresh.y - RESERVOIR.depth / 2),
    }
  }
  if (captured.waste) {
    out.waste = {
      x: r1(captured.waste.x - RESERVOIR.width / 2),
      y: r1(captured.waste.y - RESERVOIR.depth / 2),
    }
  }
  return out
}
