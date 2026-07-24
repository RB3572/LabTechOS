// ---------------------------------------------------------------------------
// G-code generation + parsing for LabTechOS.
//
// Turns a deck layout + protocol routine into a realistic media-exchange
// program, plus a structured tool-path the simulation animates and per-line
// explanations the G-Code viewer surfaces on click.
// ---------------------------------------------------------------------------

import type { DeckConfig, Plate, WorkflowStep } from '@/types'
import {
  PLATE_MODELS,
  RESERVOIR,
  defaultClearanceZ,
  plateLocalToMachine,
  type PlateModelDef,
} from '@/lib/deck'

export interface Pt {
  x: number
  y: number
  z: number
}

export type SegKind =
  | 'home'
  | 'travel'
  | 'down'
  | 'up'
  | 'aspirate'
  | 'dispense'
  | 'dwell'

/** One executable motion/dwell, linked back to the source line for highlight sync. */
export interface PathSeg {
  line: number
  from: Pt
  to: Pt
  feed: number // mm/min
  kind: SegKind
  /** Real-world duration in ms (dwell time, or extrude time for aspirate/dispense). */
  holdMs?: number
  /** True while the pipette is holding liquid. */
  carrying?: boolean
}

export interface GcodeProgram {
  lines: string[]
  text: string
  path: PathSeg[]
  meta: {
    wells: number
    operations: number
    durationMs: number
    lineCount: number
  }
}

const TRAVEL_FEED = 6000 // XY rapids (mm/min)
const Z_FEED = 1200 // plunge / retract
const FLOW_FEED = 240 // syringe aspirate / dispense

const f1 = (v: number) => Math.round(v * 10) / 10
const fmt = (v: number) => f1(v).toFixed(1)
// Extruder values keep finer precision than XY/Z — a calibrated plunger move
// can be a small fraction of a millimetre, and rounding it to 0.1 would distort
// small volumes.
const fmtE = (v: number) => String(Math.round(v * 1000) / 1000)

// ---------------------------------------------------------------------------
// Well geometry — landscape layout matching the deck STL (larger count on X),
// consistent with calibration's calTargets.
// ---------------------------------------------------------------------------

export function wellPositions(
  deck: DeckConfig,
  plate: Plate,
  model: PlateModelDef = PLATE_MODELS[plate.type],
): Record<string, { x: number; y: number }> {
  const nX = Math.max(plate.rows, plate.cols)
  const nY = Math.min(plate.rows, plate.cols)
  const offX = (model.width - (nX - 1) * plate.pitch) / 2
  const offY = (model.depth - (nY - 1) * plate.pitch) / 2
  const rowsAlongX = plate.rows >= plate.cols

  const out: Record<string, { x: number; y: number }> = {}
  for (let r = 0; r < plate.rows; r++) {
    for (let c = 0; c < plate.cols; c++) {
      const id = `${plate.rowLabels[r]}${plate.colLabels[c]}`
      const cX = rowsAlongX ? r : c
      const cY = rowsAlongX ? c : r
      // Well centres ride the plate's rotation, so a slightly skewed plate is
      // still addressed correctly.
      const p = plateLocalToMachine(deck, {
        x: offX + cX * plate.pitch,
        y: offY + cY * plate.pitch,
      })
      out[id] = { x: f1(p.x), y: f1(p.y) }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenOptions {
  deck: DeckConfig
  plate: Plate
  routine: WorkflowStep[]
  model?: PlateModelDef
  /** Calibrated nozzle Z (just above the well bottom); defaults to plate Z + 1. */
  nozzleZ?: number
  /** Calibrated nozzle Z at each tube's floor — how deep the pipette dips. */
  freshZ?: number
  wasteZ?: number
  /** Calibrated safe travel Z clearing the tube mouths; defaults to the tallest object + margin. */
  travelZ?: number
  /** Calibrated extruder travel (mm) per microlitre; defaults to 1 (uncalibrated). */
  ulToE?: number
}

/** Duration (ms) the simulation/estimate should attribute to a segment. */
export function segDurationMs(seg: PathSeg): number {
  if (seg.kind === 'dwell' || seg.kind === 'aspirate' || seg.kind === 'dispense') {
    return seg.holdMs ?? 0
  }
  const dist = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y, seg.to.z - seg.from.z)
  if (!seg.feed) return 0
  return (dist / (seg.feed / 60)) * 1000
}

export function generateGcode(opts: GenOptions): GcodeProgram {
  const model = opts.model ?? PLATE_MODELS[opts.plate.type]
  const { deck, plate, routine } = opts
  const ulToE = opts.ulToE && opts.ulToE > 0 ? opts.ulToE : 1
  const positions = wellPositions(deck, plate, model)

  // Travel height must clear the tube mouths, which stand far taller than the
  // plate — a calibrated capture wins, otherwise fall back to the tallest object.
  const travelZ = f1(opts.travelZ ?? defaultClearanceZ(deck, plate.height))
  const nozzleZ = opts.nozzleZ ?? f1(deck.plate.z + 1)
  const dispenseZ = f1(nozzleZ + 1.5)
  // How far down each tube's bore the pipette dips to reach liquid.
  const freshZ = f1(opts.freshZ ?? RESERVOIR.floor)
  const wasteZ = f1(opts.wasteZ ?? RESERVOIR.floor)
  const fresh = {
    x: f1(deck.freshMedia.x + RESERVOIR.width / 2),
    y: f1(deck.freshMedia.y + RESERVOIR.depth / 2),
  }
  const waste = {
    x: f1(deck.waste.x + RESERVOIR.width / 2),
    y: f1(deck.waste.y + RESERVOIR.depth / 2),
  }

  const lines: string[] = []
  const path: PathSeg[] = []
  let cur: Pt = { x: 0, y: 0, z: 0 }
  let carrying = false
  let operations = 0

  const comment = (text: string) => lines.push(`; ${text}`)
  const blank = () => lines.push('')

  const move = (
    to: Partial<Pt>,
    feed: number,
    kind: SegKind,
    word: 'G0' | 'G1' = 'G1',
  ) => {
    const dest: Pt = {
      x: to.x ?? cur.x,
      y: to.y ?? cur.y,
      z: to.z ?? cur.z,
    }
    const parts: string[] = [word]
    if (to.x !== undefined) parts.push(`X${fmt(dest.x)}`)
    if (to.y !== undefined) parts.push(`Y${fmt(dest.y)}`)
    if (to.z !== undefined) parts.push(`Z${fmt(dest.z)}`)
    parts.push(`F${feed}`)
    lines.push(parts.join(' '))
    path.push({ line: lines.length - 1, from: { ...cur }, to: dest, feed, kind, carrying })
    cur = dest
  }

  const extrude = (vol: number, kind: 'aspirate' | 'dispense') => {
    // Convert the requested microlitres into calibrated plunger travel (mm).
    const travel = vol * ulToE
    const e = kind === 'aspirate' ? -travel : travel
    lines.push(`G1 E${fmtE(e)} F${FLOW_FEED}`)
    path.push({
      line: lines.length - 1,
      from: { ...cur },
      to: { ...cur },
      feed: FLOW_FEED,
      kind,
      carrying,
      holdMs: (Math.abs(travel) / FLOW_FEED) * 60000,
    })
    carrying = kind === 'aspirate'
  }

  const dwell = (seconds: number) => {
    lines.push(`G4 S${Math.round(seconds)}`)
    path.push({
      line: lines.length - 1,
      from: { ...cur },
      to: { ...cur },
      feed: 0,
      kind: 'dwell',
      holdMs: seconds * 1000,
      carrying,
    })
  }

  // --- protocol primitives -------------------------------------------------

  // Every XY move happens at clearance height — the tube mouths stand well above
  // the plate, so crossing the deck any lower would clip them.
  const travelTo = (x: number, y: number) => {
    if (cur.z < travelZ) move({ z: travelZ }, Z_FEED, 'up')
    move({ x, y }, TRAVEL_FEED, 'travel', 'G0')
  }

  // Aspirate from a single well (draw liquid up out of it).
  const aspirateWell = (wellId: string, vol: number) => {
    const p = positions[wellId]
    if (!p) return
    comment(`Aspirate ${vol} uL from ${wellId}`)
    travelTo(p.x, p.y)
    move({ z: nozzleZ }, Z_FEED, 'down')
    extrude(vol, 'aspirate')
    move({ z: travelZ }, Z_FEED, 'up')
    operations++
  }

  // Dispense into a single well.
  const dispenseWell = (wellId: string, vol: number) => {
    const p = positions[wellId]
    if (!p) return
    comment(`Dispense ${vol} uL to ${wellId}`)
    travelTo(p.x, p.y)
    move({ z: dispenseZ }, Z_FEED, 'down')
    extrude(vol, 'dispense')
    move({ z: travelZ }, Z_FEED, 'up')
    operations++
  }

  // Draw fresh media: cross to the tube at clearance height, dip down the bore,
  // aspirate, then climb back out before anything else moves in XY.
  const getMedia = (vol: number) => {
    comment(`Get ${vol} uL fresh media`)
    travelTo(fresh.x, fresh.y)
    comment(`Dip down the bore to the tube floor Z${fmt(freshZ)}`)
    move({ z: freshZ }, Z_FEED, 'down')
    extrude(vol, 'aspirate')
    comment(`Withdraw to clearance Z${fmt(travelZ)}`)
    move({ z: travelZ }, Z_FEED, 'up')
    operations++
  }

  // Expel liquid into the waste tube — same dip-and-withdraw cycle.
  const toWaste = (vol: number) => {
    comment(`Deposit ${vol} uL to waste`)
    travelTo(waste.x, waste.y)
    comment(`Dip down the bore to the tube floor Z${fmt(wasteZ)}`)
    move({ z: wasteZ }, Z_FEED, 'down')
    extrude(vol, 'dispense')
    comment(`Withdraw to clearance Z${fmt(travelZ)}`)
    move({ z: travelZ }, Z_FEED, 'up')
    operations++
  }

  // Mix a well in place: repeated aspirate/dispense cycles at the well bottom.
  const mixWell = (wellId: string, vol: number, cycles: number) => {
    const p = positions[wellId]
    if (!p || cycles <= 0) return
    comment(`Mix ${wellId} — ${cycles} cycle${cycles === 1 ? '' : 's'} of ${vol} uL`)
    travelTo(p.x, p.y)
    move({ z: nozzleZ }, Z_FEED, 'down')
    for (let i = 0; i < cycles; i++) {
      extrude(vol, 'aspirate')
      extrude(vol, 'dispense')
    }
    move({ z: travelZ }, Z_FEED, 'up')
    operations++
  }

  const executeSteps = (steps: WorkflowStep[]) => {
    for (const step of steps) {
      const vol = Number(step.params.volume) || 0
      const well = String(step.params.well ?? '')
      switch (step.type) {
        case 'loop': {
          const reps = Number(step.params.repetitions) || 0
          for (let i = 0; i < reps; i++) {
            comment(`Loop iteration ${i + 1} of ${reps}`)
            executeSteps(step.children ?? [])
          }
          break
        }
        case 'aspirate':
          if (well) aspirateWell(well, vol)
          break
        case 'dispense':
          if (well) dispenseWell(well, vol)
          break
        case 'get-media':
          getMedia(vol)
          break
        case 'to-waste':
          toWaste(vol)
          break
        case 'mix':
          if (well) mixWell(well, vol, Number(step.params.cycles) || 0)
          break
        case 'wait': {
          const dur = Number(step.params.duration) || 0
          const unit = String(step.params.unit)
          const seconds = unit === 'hours' ? dur * 3600 : unit === 'minutes' ? dur * 60 : dur
          comment(`Wait ${dur} ${unit}`)
          dwell(seconds)
          operations++
          break
        }
      }
    }
  }

  // --- preamble ------------------------------------------------------------

  comment('LabTechOS generated program')
  comment(`Plate: ${plate.name} (${plate.wellCount} wells)`)
  comment(`Travel/clearance Z ${fmt(travelZ)} mm · well nozzle Z ${fmt(nozzleZ)} mm`)
  comment(`Tube floors — fresh Z ${fmt(freshZ)} mm · waste Z ${fmt(wasteZ)} mm`)
  comment(
    ulToE === 1
      ? 'Pipette: uncalibrated (1 mm plunger = 1 uL)'
      : `Pipette: ${fmtE(ulToE)} mm plunger travel per uL`,
  )
  blank()
  lines.push('G21') // mm
  lines.push('G90') // absolute
  lines.push('M83') // relative extruder
  lines.push('G28') // home all
  path.push({ line: lines.length - 1, from: { ...cur }, to: { x: 0, y: 0, z: 0 }, feed: TRAVEL_FEED, kind: 'home' })
  cur = { x: 0, y: 0, z: 0 }
  move({ z: travelZ }, Z_FEED, 'up')
  blank()

  // --- body ----------------------------------------------------------------

  const usedWells = new Set<string>()
  const collectWells = (steps: WorkflowStep[]) => {
    for (const s of steps) {
      const w = s.params.well
      if (typeof w === 'string' && w && positions[w]) usedWells.add(w)
      if (s.children) collectWells(s.children)
    }
  }
  collectWells(routine)

  comment(`— Routine: ${routine.length} top-level step${routine.length === 1 ? '' : 's'}`)
  executeSteps(routine)
  blank()

  // --- postamble -----------------------------------------------------------

  comment('Park + power down')
  move({ z: travelZ }, Z_FEED, 'up')
  lines.push('G28 X Y')
  path.push({ line: lines.length - 1, from: { ...cur }, to: { x: 0, y: 0, z: cur.z }, feed: TRAVEL_FEED, kind: 'travel' })
  cur = { x: 0, y: 0, z: cur.z }
  lines.push('M84')
  comment('End of program')

  const durationMs = path.reduce((sum, s) => sum + segDurationMs(s), 0)

  return {
    lines,
    text: lines.join('\n'),
    path,
    meta: {
      wells: usedWells.size,
      operations,
      durationMs,
      lineCount: lines.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Per-line explanation (drives the G-Code viewer's side panel)
// ---------------------------------------------------------------------------

export interface LineExplanation {
  title: string
  detail: string
}

const axisList = (line: string): string => {
  const out: string[] = []
  const x = line.match(/X(-?\d+\.?\d*)/)
  const y = line.match(/Y(-?\d+\.?\d*)/)
  const z = line.match(/Z(-?\d+\.?\d*)/)
  if (x) out.push(`X to ${x[1]} mm`)
  if (y) out.push(`Y to ${y[1]} mm`)
  if (z) out.push(`Z to ${z[1]} mm`)
  return out.join(', ')
}

export function explainLine(raw: string): LineExplanation {
  const line = raw.trim()
  if (line === '') return { title: 'Blank line', detail: 'Spacing between protocol sections — ignored by the printer.' }
  if (line.startsWith(';')) {
    return { title: 'Comment', detail: line.replace(/^;\s*/, '') || 'A note for humans; the firmware skips it.' }
  }

  const feed = line.match(/F(\d+\.?\d*)/)
  const feedNote = feed ? ` Feed rate ${feed[1]} mm/min.` : ''
  const e = line.match(/E(-?\d+\.?\d*)/)

  // Motion with an extruder move = aspirate / dispense
  if (e && /^G1/.test(line)) {
    const vol = Math.abs(parseFloat(e[1]))
    if (parseFloat(e[1]) < 0) {
      return {
        title: 'Aspirate',
        detail: `Draw ${vol} µL of liquid into the pipette by retracting the syringe plunger.${feedNote}`,
      }
    }
    return {
      title: 'Dispense',
      detail: `Expel ${vol} µL of liquid by advancing the syringe plunger.${feedNote}`,
    }
  }

  const head = line.split(/\s+/)[0]
  switch (head) {
    case 'G0':
      return { title: 'Rapid travel move', detail: `Move at maximum speed without pipetting — ${axisList(line) || 'reposition the toolhead'}.${feedNote}` }
    case 'G1': {
      const hasZ = /Z/.test(line)
      const hasXY = /[XY]/.test(line)
      const verb = hasZ && !hasXY ? 'Lower/raise the pipette' : 'Controlled linear move'
      return { title: 'Linear move', detail: `${verb} — ${axisList(line)}.${feedNote}` }
    }
    case 'G4': {
      const s = line.match(/S(\d+\.?\d*)/)
      const p = line.match(/P(\d+\.?\d*)/)
      const secs = s ? `${s[1]} s` : p ? `${Number(p[1]) / 1000} s` : 'a set time'
      return { title: 'Dwell / wait', detail: `Pause motion for ${secs} — used for incubation between steps.` }
    }
    case 'G21':
      return { title: 'Units = millimeters', detail: 'All following coordinates are interpreted in millimeters.' }
    case 'G20':
      return { title: 'Units = inches', detail: 'All following coordinates are interpreted in inches.' }
    case 'G90':
      return { title: 'Absolute positioning', detail: 'Coordinates are measured from the machine origin (0,0,0).' }
    case 'G91':
      return { title: 'Relative positioning', detail: 'Coordinates are measured from the current position.' }
    case 'G28': {
      const which = /[XYZ]/.test(line.slice(3)) ? line.slice(3).trim() : 'all axes'
      return { title: 'Home', detail: `Drive ${which} to their endstops to establish a known reference position.` }
    }
    case 'M82':
      return { title: 'Extruder absolute', detail: 'Syringe plunger amounts are absolute from a zero reference.' }
    case 'M83':
      return { title: 'Extruder relative', detail: 'Each aspirate/dispense amount is relative to the last — the natural mode for discrete transfers.' }
    case 'M84':
      return { title: 'Disable steppers', detail: 'Release the motors so the axes can be moved by hand. Ends the program safely.' }
    case 'M114':
      return { title: 'Report position', detail: 'Ask the firmware to send back the current X/Y/Z coordinates.' }
    case 'M106':
      return { title: 'Fan on', detail: 'Turn on the part-cooling fan.' }
    case 'M107':
      return { title: 'Fan off', detail: 'Turn off the part-cooling fan.' }
    case 'M112':
      return { title: 'Emergency stop', detail: 'Immediately halt all motion and heaters.' }
    default:
      return { title: head, detail: 'Firmware command.' }
  }
}

// ---------------------------------------------------------------------------
// Syntax highlighting tokens for the viewer
// ---------------------------------------------------------------------------

export type GTokenKind = 'comment' | 'g' | 'm' | 'x' | 'y' | 'z' | 'e' | 'f' | 's' | 'plain'

export interface GToken {
  text: string
  kind: GTokenKind
}

export function tokenizeLine(raw: string): GToken[] {
  if (raw.trim().startsWith(';')) return [{ text: raw, kind: 'comment' }]
  const tokens: GToken[] = []
  // split off any trailing comment
  const ci = raw.indexOf(';')
  const code = ci >= 0 ? raw.slice(0, ci) : raw
  const trailing = ci >= 0 ? raw.slice(ci) : ''
  for (const word of code.split(/(\s+)/)) {
    if (/^\s+$/.test(word) || word === '') {
      if (word) tokens.push({ text: word, kind: 'plain' })
      continue
    }
    const letter = word[0].toUpperCase()
    const kind: GTokenKind =
      letter === 'G' ? 'g'
      : letter === 'M' ? 'm'
      : letter === 'X' ? 'x'
      : letter === 'Y' ? 'y'
      : letter === 'Z' ? 'z'
      : letter === 'E' ? 'e'
      : letter === 'F' ? 'f'
      : letter === 'S' || letter === 'P' ? 's'
      : 'plain'
    tokens.push({ text: word, kind })
  }
  if (trailing) tokens.push({ text: trailing, kind: 'comment' })
  return tokens
}

/** Format an estimated runtime in a compact, human form. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}
