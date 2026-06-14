// ---------------------------------------------------------------------------
// .cell file — a single portable snapshot of a CellSlicer protocol: the deck
// object placements, the build volume, the programmed routine, and any
// calibration captures. Saved as JSON, loaded back on the dashboard.
// ---------------------------------------------------------------------------

import type { BedSize, DeckConfig, PlateType, WorkflowStep } from '@/types'
import type { CalKey, Vec3 } from '@/lib/calibration'

export interface PipetteCalibration {
  source: 'fresh' | 'waste' | null
  volumeUl: number
  ePosition: number
  mmPerUl: number | null
}

export interface CellConfig {
  plateType: PlateType
  selectedWells: string[]
  workflows: Record<string, WorkflowStep[]>
  deck: DeckConfig
  bed: BedSize
  calibration?: { captured: Partial<Record<CalKey, Vec3>> }
  pipette?: PipetteCalibration
}

interface CellFile extends CellConfig {
  format: 'cellslicer'
  version: number
  app: string
  savedAt?: string
}

const FORMAT = 'cellslicer'

/** Serialize the current configuration to a pretty-printed .cell document. */
export function serializeConfig(cfg: CellConfig, savedAt?: string): string {
  const file: CellFile = {
    format: FORMAT,
    version: 1,
    app: 'CellSlicer',
    savedAt,
    ...cfg,
  }
  return JSON.stringify(file, null, 2)
}

/** Parse + validate a .cell document, throwing a friendly error on mismatch. */
export function parseCellFile(text: string): CellConfig {
  let data: Partial<CellFile>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON — it may be corrupted.')
  }
  if (!data || data.format !== FORMAT) {
    throw new Error('Not a CellSlicer (.cell) file.')
  }
  if (!data.deck || !data.plateType) {
    throw new Error('The .cell file is missing required configuration fields.')
  }
  return {
    plateType: data.plateType,
    selectedWells: Array.isArray(data.selectedWells) ? data.selectedWells : [],
    workflows:
      data.workflows && typeof data.workflows === 'object' ? data.workflows : {},
    deck: data.deck,
    bed: data.bed ?? { x: 256, y: 256, z: 220 },
    calibration: data.calibration,
    pipette: data.pipette,
  }
}

/** Trigger a browser download of arbitrary text content. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = 'application/json',
): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Open a native file picker and resolve the chosen file's text (or null). */
export function pickCellFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.cell,application/json,application/cellslicer'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}
