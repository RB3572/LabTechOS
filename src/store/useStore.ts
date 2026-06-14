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
import {
  PLATES,
  compareWellIds,
  generateWells,
  selectionKey,
} from '@/lib/plate'
import { BED, PLATE_MODELS, RESERVOIR } from '@/lib/deck'
import { type CalKey, type Vec3, computeDeckFromCalibration } from '@/lib/calibration'
import type { GcodeProgram } from '@/lib/gcode'
import type { CellConfig } from '@/lib/cellfile'
import { createStep } from '@/lib/workflow'
import { RECENT_PROJECTS } from '@/data/projects'

// Shared empty reference so selectors don't return a fresh array each render.
const EMPTY_STEPS: WorkflowStep[] = []

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

  // labware + selection
  plateType: PlateType
  selectedWells: string[]

  // protocol — workflows scoped by selected well set
  workflows: Record<string, WorkflowStep[]>

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

  // selection actions
  clickWell: (id: string, additive: boolean) => void
  setSelection: (ids: string[]) => void
  selectRow: (rowIndex: number, additive: boolean) => void
  selectColumn: (colIndex: number, additive: boolean) => void
  selectAll: () => void
  clearSelection: () => void

  // workflow actions (operate on the active well set's workflow)
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
  /** Replace the active well set's workflow with the result of `mutate`. */
  const mutateWorkflow = (mutate: (steps: WorkflowStep[]) => WorkflowStep[]) => {
    const key = selectionKey(get().selectedWells)
    set((state) => ({
      workflows: {
        ...state.workflows,
        [key]: mutate(state.workflows[key] ?? []),
      },
      gcode: null,
    }))
  }

  /** Toggle a group (row/col/all) on or off, or replace the selection with it. */
  const applyGroupSelect = (ids: string[], additive: boolean) => {
    if (!additive) {
      get().setSelection(ids)
      return
    }
    const current = new Set(get().selectedWells)
    const allSelected = ids.every((id) => current.has(id))
    if (allSelected) ids.forEach((id) => current.delete(id))
    else ids.forEach((id) => current.add(id))
    get().setSelection([...current])
  }

  return {
    page: 'dashboard',
    activeProjectId: null,
    projects: RECENT_PROJECTS,

    plateType: '96-well',
    selectedWells: [],

    workflows: {},

    deck: {
      plate: { x: 12, y: 12, z: 1.5 },
      freshMedia: { x: 142.5, y: 12, height: RESERVOIR.height },
      waste: { x: 142.5, y: 230, height: RESERVOIR.height },
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
        selectedWells: [],
        gcode: null,
      })
    },

    startNewProject: () =>
      set({
        page: 'plate-setup',
        activeProjectId: null,
        selectedWells: [],
        gcode: null,
      }),

    setGcode: (program) => set({ gcode: program }),

    getConfig: () => {
      const s = get()
      return {
        plateType: s.plateType,
        selectedWells: s.selectedWells,
        workflows: s.workflows,
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
        selectedWells: cfg.selectedWells ?? [],
        workflows: cfg.workflows ?? {},
        deck: cfg.deck,
        bed: cfg.bed,
        calibration: {
          ...s.calibration,
          captured: cfg.calibration?.captured ?? {},
        },
        pipette: cfg.pipette ? { ...s.pipette, ...cfg.pipette } : s.pipette,
        gcode: null,
      })),

    setPlateType: (type) =>
      set({ plateType: type, selectedWells: [], gcode: null }),

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

    clickWell: (id, additive) => {
      const current = new Set(get().selectedWells)
      if (additive) {
        if (current.has(id)) current.delete(id)
        else current.add(id)
        get().setSelection([...current])
      } else {
        get().setSelection([id])
      }
    },

    setSelection: (ids) =>
      set({ selectedWells: [...new Set(ids)].sort(compareWellIds) }),

    selectRow: (rowIndex, additive) => {
      const plate = PLATES[get().plateType]
      const ids = plate.colLabels.map((c) => `${plate.rowLabels[rowIndex]}${c}`)
      applyGroupSelect(ids, additive)
    },

    selectColumn: (colIndex, additive) => {
      const plate = PLATES[get().plateType]
      const ids = plate.rowLabels.map((r) => `${r}${plate.colLabels[colIndex]}`)
      applyGroupSelect(ids, additive)
    },

    selectAll: () => {
      const plate = PLATES[get().plateType]
      get().setSelection(generateWells(plate).map((w) => w.id))
    },

    clearSelection: () => set({ selectedWells: [] }),

    addStep: (type) => mutateWorkflow((steps) => [...steps, createStep(type)]),

    addChildStep: (parentId, type) =>
      mutateWorkflow((steps) => addChildToTree(steps, parentId, createStep(type))),

    updateStepParams: (id, params) =>
      mutateWorkflow((steps) => updateParamsInTree(steps, id, params)),

    insertStep: (type, targetId, before) =>
      mutateWorkflow((steps) =>
        insertRelativeToTarget(steps, targetId, createStep(type), before),
      ),

    removeStep: (id) => mutateWorkflow((steps) => removeFromTree(steps, id)),

    moveStep: (dragId, targetId, before) => {
      if (dragId === targetId) return
      mutateWorkflow((steps) => {
        const node = findStep(steps, dragId)
        // Abort if the block doesn't exist or we'd nest it inside itself.
        if (!node || subtreeIds(node).has(targetId)) return steps
        const { tree, removed } = removeAndGet(steps, dragId)
        if (!removed) return steps
        return insertRelativeToTarget(tree, targetId, removed, before)
      })
    },

    moveStepToEnd: (dragId, parentId) => {
      mutateWorkflow((steps) => {
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

/** The workflow steps belonging to the currently selected well set. */
export function useActiveWorkflow(): WorkflowStep[] {
  return useStore((s) => s.workflows[selectionKey(s.selectedWells)] ?? EMPTY_STEPS)
}

/** A plate is "configured" once at least one protocol step has been defined. */
export function usePlateConfigured(): boolean {
  return useStore((s) =>
    Object.values(s.workflows).some((steps) => steps.length > 0),
  )
}
