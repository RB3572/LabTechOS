// ---------------------------------------------------------------------------
// Core domain types for LabTechOS
// ---------------------------------------------------------------------------

/** Which application screen is currently mounted (simple state-based routing). */
export type Page =
  | 'dashboard'
  | 'plate-setup'
  | 'deck-setup'
  | 'simulation'
  | 'g-code'
  | 'calibration'
  | 'pipette-calibration'
  | 'machine-control'
  | 'support'
  | 'logs'

/** Supported labware. Geometry for each lives in `lib/plate.ts`. */
export type PlateType = '6-well' | '12-well' | '24-well' | '96-well'

/**
 * A single addressable well on a plate.
 * `id` is the human label (e.g. "A1"); `row`/`col` are 0-based indices.
 */
export interface Well {
  id: string
  row: number
  col: number
  rowLabel: string // "A".."H"
  colLabel: string // "1".."12"
}

/**
 * Physical + logical description of a plate. All dimensions are in millimetres
 * so the visualization can be rendered to scale.
 */
export interface Plate {
  type: PlateType
  /** Display name, e.g. "96 Well Plate". */
  name: string
  /** Short descriptor shown in the controls panel. */
  vendor: string
  rows: number
  cols: number
  rowLabels: string[]
  colLabels: string[]
  /** Total addressable wells (rows × cols). */
  wellCount: number
  /** Well opening diameter in millimetres. */
  wellDiameter: number
  /** Center-to-center spacing between wells in millimetres. */
  pitch: number
  /** Overall plate height (Z) in millimetres. */
  height: number
  /** Nominal working volume per well, in microlitres (for flavor/specs). */
  workingVolume: number
}

/** Lifecycle state of a saved protocol, rendered as a colored pill. */
export type ProjectStatus = 'Draft' | 'Validated' | 'Error'

/** A saved protocol shown in the Recent Projects table. */
export interface Project {
  id: string
  name: string
  dateModified: string
  plateType: string
  plate: PlateType
  status: ProjectStatus
}

// ---------------------------------------------------------------------------
// Workflow / protocol blocks
// ---------------------------------------------------------------------------

/**
 * Protocol primitives. Aspirate/dispense/mix each act on a single well;
 * get-media/to-waste act on the shared reservoirs; wait/loop are control flow.
 */
export type BlockType =
  | 'aspirate'
  | 'dispense'
  | 'get-media'
  | 'to-waste'
  | 'mix'
  | 'wait'
  | 'loop'

/** Parameter values are keyed by name; numbers for volumes/durations, strings for units + the target well. */
export type StepParams = Record<string, number | string>

/**
 * A single block in the protocol. `loop` blocks own a `children` array; all
 * other blocks are leaves. Well-targeted blocks carry their well in `params.well`.
 */
export interface WorkflowStep {
  id: string
  type: BlockType
  params: StepParams
  children?: WorkflowStep[]
}

/** A protocol is just the ordered list of top-level steps. */
export type Workflow = WorkflowStep[]

export type BlockAccent =
  | 'rose'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'slate'
  | 'indigo'

/** Static description of a block type used by the library + renderers. */
export interface BlockDefinition {
  type: BlockType
  label: string
  description: string
  /** Tailwind tint tokens for the block's accent treatment. */
  accent: BlockAccent
  /** Whether this block can contain nested children. */
  container: boolean
  /** Whether this block acts on a single, user-chosen well. */
  targetsWell: boolean
  /** Default parameter values when the block is first dropped. */
  defaults: StepParams
}

// ---------------------------------------------------------------------------
// Deck / hardware configuration
// ---------------------------------------------------------------------------

/** The placeable objects on the printer deck. */
export type DeckObjectKey = 'plate' | 'freshMedia' | 'waste'

/**
 * Physical placement of every deck object, in machine millimetre coordinates.
 * (x, y) is the near corner of an object's footprint; z is the plate's
 * Z-offset above the bed.
 */
export interface DeckConfig {
  plate: { x: number; y: number; z: number }
  /** Reservoirs carry a `height` (mm) so the pipette can clear the rim. */
  freshMedia: { x: number; y: number; height: number }
  waste: { x: number; y: number; height: number }
}

/** Which configuration tab is active in the deck side panel. */
export type DeckTab = DeckObjectKey | 'printer'

/** Printer build volume in millimetres. */
export interface BedSize {
  x: number
  y: number
  z: number
}

export type ValidationLevel = 'valid' | 'warning' | 'error'

/** Result of validating a single deck object. */
export interface ObjectStatus {
  level: ValidationLevel
  label: string
}
