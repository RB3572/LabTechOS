import type { Plate, PlateType, Well } from '@/types'

// ---------------------------------------------------------------------------
// Plate catalog — real ANSI/SLAS-derived geometry (millimetres)
// ---------------------------------------------------------------------------
//
// The visualization is rendered in a millimetre coordinate space so that the
// well diameter and the center-to-center pitch are reproduced to scale. A
// 24-well plate therefore looks materially different from a 96-well plate
// (larger wells, wider spacing) rather than being a generic resized grid.

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP'.split('')

function makeColLabels(cols: number): string[] {
  return Array.from({ length: cols }, (_, i) => String(i + 1))
}

export const PLATES: Record<PlateType, Plate> = {
  '24-well': {
    type: '24-well',
    name: '24 Well Plate',
    vendor: 'Corning · Flat Bottom',
    rows: 6,
    cols: 4,
    rowLabels: ROW_LETTERS.slice(0, 6),
    colLabels: makeColLabels(4),
    wellCount: 24,
    wellDiameter: 15.6,
    pitch: 19.3,
    height: 19.0,
    workingVolume: 1900,
  },
  '96-well': {
    type: '96-well',
    name: '96 Well Plate',
    vendor: 'Corning · Flat Bottom',
    rows: 8,
    cols: 12,
    rowLabels: ROW_LETTERS.slice(0, 8),
    colLabels: makeColLabels(12),
    wellCount: 96,
    wellDiameter: 6.4,
    pitch: 9.0,
    height: 14.3,
    workingVolume: 360,
  },
}

export const PLATE_OPTIONS: { value: PlateType; label: string }[] = [
  { value: '24-well', label: '24 Well Plate' },
  { value: '96-well', label: '96 Well Plate' },
]

/** Build the full, ordered list of wells for a plate (row-major: A1, A2, …). */
export function generateWells(plate: Plate): Well[] {
  const wells: Well[] = []
  for (let r = 0; r < plate.rows; r++) {
    for (let c = 0; c < plate.cols; c++) {
      const rowLabel = plate.rowLabels[r]
      const colLabel = plate.colLabels[c]
      wells.push({
        id: `${rowLabel}${colLabel}`,
        row: r,
        col: c,
        rowLabel,
        colLabel,
      })
    }
  }
  return wells
}

// ---------------------------------------------------------------------------
// Geometry — everything below is in millimetres and consumed by the SVG.
// ---------------------------------------------------------------------------

export interface PlateGeometry {
  /** SVG viewBox extents (mm). */
  viewWidth: number
  viewHeight: number
  /** Plate body, drawn as a rounded rect with one chamfered (A1) corner. */
  body: { x: number; y: number; w: number; h: number; corner: number; chamfer: number }
  /** Well radius (mm) and the diameter for convenience. */
  radius: number
  diameter: number
  /** Center-to-center pitch (mm) — used to size label hit areas. */
  pitch: number
  /** Gutter reserved for the A–H / 1–12 axis labels. */
  gutter: number
  /** Axis label font size (mm). */
  labelFont: number
  /** Whether wells are large enough to print their id inside. */
  showWellIds: boolean
  wellLabelFont: number
  /** Center of a well at (row, col) in mm. */
  center: (row: number, col: number) => { cx: number; cy: number }
  /** Position of a row label (left gutter). */
  rowLabelPos: (row: number) => { x: number; y: number }
  /** Position of a column label (top gutter). */
  colLabelPos: (col: number) => { x: number; y: number }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function getPlateGeometry(plate: Plate): PlateGeometry {
  const { rows, cols, pitch, wellDiameter } = plate
  const radius = wellDiameter / 2

  // Axis labels live in a gutter outside the plate body.
  const labelFont = clamp(pitch * 0.32, 2.7, 4.4)
  const gutter = labelFont + 3.8

  // The plastic skirt around the well field.
  const skirt = radius + Math.max(3, pitch * 0.16)
  const outerPad = 2.5

  const cx0 = gutter + skirt + radius
  const cy0 = gutter + skirt + radius

  const bodyW = skirt * 2 + (cols - 1) * pitch + radius * 2
  const bodyH = skirt * 2 + (rows - 1) * pitch + radius * 2

  const body = {
    x: gutter,
    y: gutter,
    w: bodyW,
    h: bodyH,
    corner: clamp(pitch * 0.38, 3, 7),
    chamfer: clamp(radius + 1.5, 4, 11),
  }

  return {
    viewWidth: gutter + bodyW + outerPad,
    viewHeight: gutter + bodyH + outerPad,
    body,
    radius,
    diameter: wellDiameter,
    pitch,
    gutter,
    labelFont,
    showWellIds: radius >= 6,
    wellLabelFont: clamp(radius * 0.62, 3, 7),
    center: (row, col) => ({ cx: cx0 + col * pitch, cy: cy0 + row * pitch }),
    rowLabelPos: (row) => ({ x: gutter * 0.52, y: cy0 + row * pitch }),
    colLabelPos: (col) => ({ x: cx0 + col * pitch, y: gutter * 0.52 }),
  }
}

// ---------------------------------------------------------------------------
// Physical geometry (for the 3D deck) — real millimetre footprint + wells.
// Uses the same skirt as the 2D view so the two stay consistent.
// ---------------------------------------------------------------------------

export interface PlateWellPoint {
  id: string
  row: number
  col: number
  /** Center of the well, relative to the plate's near corner (mm). */
  x: number
  y: number
}

export interface PlatePhysical {
  /** Footprint width (X) and depth (Y) in mm. */
  width: number
  depth: number
  /** Overall plate height (Z) in mm. */
  height: number
  /** Plastic skirt from the plate edge to the outer wells (mm). */
  skirt: number
  /** Well opening radius (mm). */
  wellRadius: number
  wells: PlateWellPoint[]
}

export function getPlatePhysical(plate: Plate): PlatePhysical {
  const { rows, cols, pitch, wellDiameter, height } = plate
  const radius = wellDiameter / 2
  const skirt = radius + Math.max(3, pitch * 0.16)

  const width = skirt * 2 + (cols - 1) * pitch + radius * 2
  const depth = skirt * 2 + (rows - 1) * pitch + radius * 2

  const x0 = skirt + radius
  const y0 = skirt + radius

  const wells: PlateWellPoint[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      wells.push({
        id: `${plate.rowLabels[r]}${plate.colLabels[c]}`,
        row: r,
        col: c,
        x: x0 + c * pitch,
        y: y0 + r * pitch,
      })
    }
  }

  return { width, depth, height, skirt, wellRadius: radius, wells }
}

// ---------------------------------------------------------------------------
// Well label helpers
// ---------------------------------------------------------------------------

interface ParsedWell {
  id: string
  rowLabel: string
  col: number
}

function parseWellId(id: string): ParsedWell {
  const m = id.match(/^([A-Z]+)(\d+)$/)
  if (!m) return { id, rowLabel: id, col: 0 }
  return { id, rowLabel: m[1], col: parseInt(m[2], 10) }
}

/** Canonical ordering: row letter, then column number. */
export function compareWellIds(a: string, b: string): number {
  const pa = parseWellId(a)
  const pb = parseWellId(b)
  if (pa.rowLabel !== pb.rowLabel) return pa.rowLabel < pb.rowLabel ? -1 : 1
  return pa.col - pb.col
}

/** Stable key for the currently selected well set (used to scope a workflow). */
export function selectionKey(ids: string[]): string {
  return [...ids].sort(compareWellIds).join(',')
}

/**
 * Collapse a selection into a compact, human label.
 * e.g. ["A1","A2","A3","B1","C3","C4"] -> "A1–A3, B1, C3–C4"
 */
export function formatWellRanges(ids: string[]): string {
  if (ids.length === 0) return ''
  const parsed = [...ids].map(parseWellId).sort((a, b) =>
    a.rowLabel === b.rowLabel ? a.col - b.col : a.rowLabel < b.rowLabel ? -1 : 1,
  )

  const parts: string[] = []
  let i = 0
  while (i < parsed.length) {
    const start = parsed[i]
    let end = start
    let j = i + 1
    while (
      j < parsed.length &&
      parsed[j].rowLabel === end.rowLabel &&
      parsed[j].col === end.col + 1
    ) {
      end = parsed[j]
      j++
    }
    parts.push(start.id === end.id ? start.id : `${start.id}–${end.id}`)
    i = j
  }
  return parts.join(', ')
}
