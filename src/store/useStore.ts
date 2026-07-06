import { create } from 'zustand'
import type {
  BedSize,
  BlockType,
  DeckConfig,
  DeckObjectKey,
  DeckTab,
  Page,
  PlateType,
  Project,
  StepParams,
  WorkflowStep,
} from '@/types'
import { PLATES } from '@/lib/plate'
import { BED, PLATE_MODELS, RESERVOIR } from '@/lib/deck'
import { type CalKey, type Vec3, computeDeckFromCalibration } from '@/lib/calibration'
import type { GcodeProgram } from '@/lib/gcode'
import type { CellConfig } from '@/lib/cellfile'
import { createStep } from '@/lib/workflow'
import { RECENT_PROJECTS } from '@/data/projects'

// ---------------------------------------------------------------------------
// Pure tree helpers for the (possibly nested) workflow step list
// ---------------------------------------------------------------------------

function addChildToTree(
  steps: WorkflowStep[],
  parentId: string,
  child: WorkflowStep,
): WorkflowStep[] {
  return steps.map((s) => {
    if (s.id === parentId && s.children) {
      return { ...s, children: [...s.children, child] }
    }
    if (s.children) {
      return { ...s, children: addChildToTree(s.children, parentId, child) }
    }
    return s
  })
}

function updateParamsInTree(
  steps: WorkflowStep[],
  id: string,
  params: StepParams,
): WorkflowStep[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, params: { ...s.params, ...params } }
    if (s.children) {
      return { ...s, children: updateParamsInTree(s.children, id, params) }
    }
    return s
  })
}

function removeFromTree(steps: WorkflowStep[], id: string): WorkflowStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) =>
      s.children ? { ...s, children: removeFromTree(s.children, id) } : s,
    )
}

/** Locate a step anywhere in the tree. */
function findStep(steps: WorkflowStep[], id: string): WorkflowStep | null {
  for (const s of steps) {
    if (s.id === id) return s
    if (s.children) {
      const found = findStep(s.children, id)
      if (found) return found
    }
  }
  return null
}

/** All ids in a node's subtree (including the node itself) — used to forbid
 * dropping a block inside its own descendants. */
function subtreeIds(node: WorkflowStep): Set<string> {
  const ids = new Set<string>([node.id])
  const stack = [...(node.children ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    ids.add(n.id)
    if (n.children) stack.push(...n.children)
  }
  return ids
}

/** Remove a step and return both the new tree and the removed node. */
function removeAndGet(
  steps: WorkflowStep[],
  id: string,
): { tree: WorkflowStep[]; removed: WorkflowStep | null } {
  let removed: WorkflowStep | null = null
  const walk = (list: WorkflowStep[]): WorkflowStep[] => {
    const out: WorkflowStep[] = []
    for (const s of list) {
      if (s.id === id) {
        removed = s
        continue
      }
      out.push(s.children ? { ...s, children: walk(s.children) } : s)
    }
    return out
  }
  const tree = walk(steps)
  return { tree, removed }
}

/** Insert `node` immediately before/after `targetId`, wherever it lives. */
function insertRelativeToTarget(
  steps: WorkflowStep[],
  targetId: string,
  node: WorkflowStep,
  before: boolean,
): WorkflowStep[] {
  const out: WorkflowStep[] = []
  for (const s of steps) {
    if (s.id === targetId) {
      if (before) out.push(node)
      out.push(s)
      if (!before) out.push(node)
    } else if (s.children) {
      out.push({
        ...s,
        children: insertRelativeToTarget(s.children, targetId, node, before),
      })
    } else {
      out.push(s)
    }
  }
  return out
}

/** Append `node` to the end of a container (root when parentId is null). */
function insertAtEnd(
  steps: WorkflowStep[],
  parentId: string | null,
  node: WorkflowStep,
): WorkflowStep[] {
  if (parentId === null) return [...steps, node]
  return steps.map((s) => {
    if (s.id === parentId && s.children) {
      return { ...s, children: [...s.children, node] }
    }
    if (s.children) return { ...s, children: insertAtEnd(s.children, parentId, node) }
    return s
  })
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AppState {
  // routing
  page: Page
  activeProjectId: string | null
  projects: Project[]

  // labware
  plateType: PlateType

  // protocol — a single ordered routine of per-well / reservoir steps
  routine: WorkflowStep[]
  /** The block currently being edited (its well is set by clicking the map). */
  selectedStepId: string | null

  // deck / hardware layout
  deck: DeckConfig
  bed: BedSize
  snapToGrid: boolean
  activeDeckTab: DeckTab

  // calibration (toolhead jog + capture)
  calibration: {
    connected: boolean
    homed: boolean
    toolhead: Vec3
    jogStep: number
    activeStep: number
    captured: Partial<Record<CalKey, Vec3>>
  }

  // pipette / extruder volume calibration
  pipette: {
    source: 'fresh' | 'waste' | null
    volumeUl: number
    ePosition: number // accumulated plunger travel during the current draw (mm)
    eStep: number
    mmPerUl: number | null // committed calibration factor
  }

  // generated program (null until the user generates from the G-Code tab)
  gcode: GcodeProgram | null

  // navigation actions
  setPage: (page: Page) => void
  openProject: (projectId: string) => void
  startNewProject: () => void

  // program + persistence actions
  setGcode: (program: GcodeProgram | null) => void
  getConfig: () => CellConfig
  loadConfig: (cfg: CellConfig) => void

  // plate actions
  setPlateType: (type: PlateType) => void

  // deck actions
  setDeckObject: (
    key: DeckObjectKey,
    pos: Partial<{ x: number; y: number; z: number; height: number }>,
  ) => void
  setBed: (size: Partial<BedSize>) => void
  setSnapToGrid: (on: boolean) => void
  setActiveDeckTab: (tab: DeckTab) => void

  // calibration actions
  setCalConnected: (on: boolean) => void
  setCalHomed: (on: boolean) => void
  setToolhead: (pos: Vec3) => void
  jogToolhead: (dx: number, dy: number, dz: number) => void
  setJogStep: (mm: number) => void
  setCalStep: (index: number) => void
  captureCalPoint: (key: CalKey) => void
  resetCalibration: () => void

  // pipette calibration actions
  setPipetteSource: (source: 'fresh' | 'waste') => void
  setPipetteVolume: (ul: number) => void
  jogExtruder: (delta: number) => void
  setPipetteEStep: (mm: number) => void
  commitPipette: () => void
  resetPipette: () => void

  // step selection + well assignment
  selectStep: (id: string | null) => void
  assignWellToSelected: (wellId: string) => void

  // workflow actions (operate on the single routine)
  addStep: (type: BlockType) => void
  addChildStep: (parentId: string, type: BlockType) => void
  insertStep: (type: BlockType, targetId: string, before: boolean) => void
  updateStepParams: (id: string, params: StepParams) => void
  removeStep: (id: string) => void
  /** Move a placed block before/after another block (handles cross-container moves). */
  moveStep: (dragId: string, targetId: string, before: boolean) => void
  /** Move a placed block to the end of a container (root when parentId is null). */
  moveStepToEnd: (dragId: string, parentId: string | null) => void
}

export const useStore = create<AppState>((set, get) => {
  /** Replace the routine with the result of `mutate`. */
  const mutateRoutine = (mutate: (steps: WorkflowStep[]) => WorkflowStep[]) => {
    set((state) => ({ routine: mutate(state.routine), gcode: null }))
  }

  return {
    page: 'dashboard',
    activeProjectId: null,
    projects: RECENT_PROJECTS,

    plateType: '96-well',

    routine: [],
    selectedStepId: null,

    deck: {
      plate: { x: 12, y: 12, z: 1.5 },
      freshMedia: { x: 160, y: 14, height: RESERVOIR.height },
      waste: { x: 160, y: 120, height: RESERVOIR.height },
    },
    bed: { ...BED },
    snapToGrid: false,
    activeDeckTab: 'plate',

    calibration: {
      connected: false,
      homed: false,
      toolhead: { x: 0, y: 0, z: 0 },
      jogStep: 1,
      activeStep: -1,
      captured: {},
    },

    pipette: {
      source: null,
      volumeUl: 100,
      ePosition: 0,
      eStep: 1,
      mmPerUl: null,
    },

    gcode: null,

    setPage: (page) => set({ page }),

    openProject: (projectId) => {
      const project = get().projects.find((p) => p.id === projectId)
      set({
        page: 'plate-setup',
        activeProjectId: projectId,
        plateType: project ? project.plate : get().plateType,
        selectedStepId: null,
        gcode: null,
      })
    },

    startNewProject: () =>
      set({
        page: 'plate-setup',
        activeProjectId: null,
        selectedStepId: null,
        gcode: null,
      }),

    setGcode: (program) => set({ gcode: program }),

    getConfig: () => {
      const s = get()
      return {
        plateType: s.plateType,
        routine: s.routine,
        deck: s.deck,
        bed: s.bed,
        calibration: { captured: s.calibration.captured },
        pipette: {
          source: s.pipette.source,
          volumeUl: s.pipette.volumeUl,
          ePosition: s.pipette.ePosition,
          mmPerUl: s.pipette.mmPerUl,
        },
      }
    },

    loadConfig: (cfg) =>
      set((s) => ({
        page: 'deck-setup',
        plateType: cfg.plateType,
        routine: cfg.routine ?? [],
        selectedStepId: null,
        deck: cfg.deck,
        bed: cfg.bed,
        calibration: {
          ...s.calibration,
          captured: cfg.calibration?.captured ?? {},
        },
        pipette: cfg.pipette ? { ...s.pipette, ...cfg.pipette } : s.pipette,
        gcode: null,
      })),

    setPlateType: (type) => set({ plateType: type, gcode: null }),

    setDeckObject: (key, pos) =>
      set((state) => ({
        deck: { ...state.deck, [key]: { ...state.deck[key], ...pos } },
        gcode: null,
      })),

    setBed: (size) => set((state) => ({ bed: { ...state.bed, ...size }, gcode: null })),

    setSnapToGrid: (on) => set({ snapToGrid: on }),

    setActiveDeckTab: (tab) => set({ activeDeckTab: tab }),

    setCalConnected: (on) =>
      set((s) => ({ calibration: { ...s.calibration, connected: on } })),

    setCalHomed: (on) =>
      set((s) => ({
        calibration: {
          ...s.calibration,
          homed: on,
          toolhead: on ? { x: 0, y: 0, z: 0 } : s.calibration.toolhead,
        },
      })),

    setToolhead: (pos) =>
      set((s) => ({ calibration: { ...s.calibration, toolhead: pos } })),

    jogToolhead: (dx, dy, dz) =>
      set((s) => {
        const t = s.calibration.toolhead
        const r = (v: number) => Math.round(v * 100) / 100
        return {
          calibration: {
            ...s.calibration,
            toolhead: { x: r(t.x + dx), y: r(t.y + dy), z: r(t.z + dz) },
          },
        }
      }),

    setJogStep: (mm) =>
      set((s) => ({ calibration: { ...s.calibration, jogStep: mm } })),

    setCalStep: (index) =>
      set((s) => ({ calibration: { ...s.calibration, activeStep: index } })),

    // Capturing a point live-updates the shared deck so Calibrated Deck Setup
    // and Manual Deck Setup always hold (and save) identical coordinates.
    // The plate only moves once all four corners are in; each reservoir moves
    // on its single capture.
    captureCalPoint: (key) =>
      set((s) => {
        const captured = {
          ...s.calibration.captured,
          [key]: { ...s.calibration.toolhead },
        }
        const plate = PLATES[s.plateType]
        const result = computeDeckFromCalibration(captured, plate, PLATE_MODELS[s.plateType])
        const deck = { ...s.deck }
        if (result.plate) deck.plate = result.plate
        if (result.freshMedia) deck.freshMedia = { ...deck.freshMedia, ...result.freshMedia }
        if (result.waste) deck.waste = { ...deck.waste, ...result.waste }
        return {
          calibration: { ...s.calibration, captured },
          deck,
          gcode: null,
        }
      }),

    resetCalibration: () =>
      set((s) => ({
        calibration: { ...s.calibration, captured: {}, activeStep: -1 },
        gcode: null,
      })),

    // Selecting a source starts a fresh draw (zero the accumulated travel).
    setPipetteSource: (source) =>
      set((s) => ({ pipette: { ...s.pipette, source, ePosition: 0 } })),

    setPipetteVolume: (ul) =>
      set((s) => ({ pipette: { ...s.pipette, volumeUl: ul } })),

    jogExtruder: (delta) =>
      set((s) => ({
        pipette: {
          ...s.pipette,
          ePosition: Math.round((s.pipette.ePosition + delta) * 100) / 100,
        },
      })),

    setPipetteEStep: (mm) =>
      set((s) => ({ pipette: { ...s.pipette, eStep: mm } })),

    // Lock in mm-of-plunger per microlitre from the travel the user dialed in.
    commitPipette: () =>
      set((s) => {
        const { ePosition, volumeUl } = s.pipette
        if (!volumeUl || ePosition === 0) return {}
        const mmPerUl = Math.round((Math.abs(ePosition) / volumeUl) * 10000) / 10000
        return { pipette: { ...s.pipette, mmPerUl }, gcode: null }
      }),

    resetPipette: () =>
      set((s) => ({ pipette: { ...s.pipette, source: null, ePosition: 0 } })),

    selectStep: (id) => set({ selectedStepId: id }),

    // Assign the clicked well to the currently-selected block (no-op unless the
    // selected block actually targets a well).
    assignWellToSelected: (wellId) => {
      const id = get().selectedStepId
      if (!id) return
      const step = findStep(get().routine, id)
      if (!step || step.type === 'wait' || step.type === 'loop') return
      if (!('well' in createStep(step.type).params)) return
      mutateRoutine((steps) => updateParamsInTree(steps, id, { well: wellId }))
    },

    addStep: (type) =>
      set((state) => {
        const step = createStep(type)
        return {
          routine: [...state.routine, step],
          gcode: null,
          // Auto-select a new well-targeted block so the map is ready to assign.
          selectedStepId: step.params.well !== undefined ? step.id : state.selectedStepId,
        }
      }),

    addChildStep: (parentId, type) => {
      const step = createStep(type)
      set((state) => ({
        routine: addChildToTree(state.routine, parentId, step),
        gcode: null,
        selectedStepId: step.params.well !== undefined ? step.id : state.selectedStepId,
      }))
    },

    updateStepParams: (id, params) =>
      mutateRoutine((steps) => updateParamsInTree(steps, id, params)),

    insertStep: (type, targetId, before) => {
      const step = createStep(type)
      set((state) => ({
        routine: insertRelativeToTarget(state.routine, targetId, step, before),
        gcode: null,
        selectedStepId: step.params.well !== undefined ? step.id : state.selectedStepId,
      }))
    },

    removeStep: (id) =>
      set((state) => ({
        routine: removeFromTree(state.routine, id),
        gcode: null,
        selectedStepId: state.selectedStepId === id ? null : state.selectedStepId,
      })),

    moveStep: (dragId, targetId, before) => {
      if (dragId === targetId) return
      mutateRoutine((steps) => {
        const node = findStep(steps, dragId)
        // Abort if the block doesn't exist or we'd nest it inside itself.
        if (!node || subtreeIds(node).has(targetId)) return steps
        const { tree, removed } = removeAndGet(steps, dragId)
        if (!removed) return steps
        return insertRelativeToTarget(tree, targetId, removed, before)
      })
    },

    moveStepToEnd: (dragId, parentId) => {
      mutateRoutine((steps) => {
        const node = findStep(steps, dragId)
        if (!node) return steps
        if (parentId !== null && subtreeIds(node).has(parentId)) return steps
        const { tree, removed } = removeAndGet(steps, dragId)
        if (!removed) return steps
        return insertAtEnd(tree, parentId, removed)
      })
    },
  }
})

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** The single ordered protocol routine. */
export function useRoutine(): WorkflowStep[] {
  return useStore((s) => s.routine)
}

/** A plate is "configured" once at least one protocol step has been defined. */
export function usePlateConfigured(): boolean {
  return useStore((s) => s.routine.length > 0)
}
