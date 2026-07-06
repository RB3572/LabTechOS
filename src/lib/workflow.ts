import type { BlockDefinition, BlockType, WorkflowStep } from '@/types'

// ---------------------------------------------------------------------------
// Block library — static definitions for the protocol primitives.
//
// Liquid-handling is expressed as discrete transfers: aspirate from a well,
// dispense to a well, pull fresh media, push to waste, or mix a well in place.
// Every aspirate/dispense/mix block targets exactly one well, so a routine can
// pick up from one well and deposit into the next.
// ---------------------------------------------------------------------------

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  aspirate: {
    type: 'aspirate',
    label: 'Aspirate from Well',
    description: 'Draw liquid out of one well.',
    accent: 'rose',
    container: false,
    targetsWell: true,
    defaults: { well: '', volume: 200 },
  },
  dispense: {
    type: 'dispense',
    label: 'Dispense to Well',
    description: 'Deposit liquid into one well.',
    accent: 'emerald',
    container: false,
    targetsWell: true,
    defaults: { well: '', volume: 200 },
  },
  'get-media': {
    type: 'get-media',
    label: 'Get Fresh Media',
    description: 'Draw fresh media from the reservoir.',
    accent: 'sky',
    container: false,
    targetsWell: false,
    defaults: { volume: 200 },
  },
  'to-waste': {
    type: 'to-waste',
    label: 'Deposit to Waste',
    description: 'Expel liquid into the waste hub.',
    accent: 'slate',
    container: false,
    targetsWell: false,
    defaults: { volume: 200 },
  },
  mix: {
    type: 'mix',
    label: 'Mix Well',
    description: 'Pipette up and down to mix one well.',
    accent: 'indigo',
    container: false,
    targetsWell: true,
    defaults: { well: '', volume: 150, cycles: 5 },
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    description: 'Pause for a fixed incubation time.',
    accent: 'amber',
    container: false,
    targetsWell: false,
    defaults: { duration: 24, unit: 'hours' },
  },
  loop: {
    type: 'loop',
    label: 'Loop',
    description: 'Repeat the contained steps N times.',
    accent: 'violet',
    container: true,
    targetsWell: false,
    defaults: { repetitions: 3 },
  },
}

export const BLOCK_ORDER: BlockType[] = [
  'aspirate',
  'dispense',
  'get-media',
  'to-waste',
  'mix',
  'wait',
  'loop',
]

export const WAIT_UNITS = ['seconds', 'minutes', 'hours'] as const

let idCounter = 0
/** Monotonic id generator (avoids Date.now()/Math.random() for determinism). */
export function makeStepId(type: BlockType): string {
  idCounter += 1
  return `${type}-${idCounter}`
}

/** Create a fresh step instance from its block definition. */
export function createStep(type: BlockType): WorkflowStep {
  const def = BLOCK_DEFINITIONS[type]
  return {
    id: makeStepId(type),
    type,
    params: { ...def.defaults },
    ...(def.container ? { children: [] } : {}),
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Total number of blocks, counting nested children inside loops. */
export function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce(
    (sum, s) => sum + 1 + (s.children ? countSteps(s.children) : 0),
    0,
  )
}

/**
 * Total machine operations for one run of the protocol. Each leaf block is one
 * operation; a loop multiplies its children by the repetition count.
 */
export function countOperations(steps: WorkflowStep[]): number {
  return steps.reduce((sum, step) => {
    if (step.type === 'loop') {
      const reps = Number(step.params.repetitions) || 0
      return sum + reps * countOperations(step.children ?? [])
    }
    return sum + 1
  }, 0)
}

/** Distinct wells referenced anywhere in the routine (for the summary + map). */
export function wellsUsed(steps: WorkflowStep[], out = new Set<string>()): Set<string> {
  for (const step of steps) {
    const w = step.params.well
    if (typeof w === 'string' && w) out.add(w)
    if (step.children) wellsUsed(step.children, out)
  }
  return out
}

/** True when a well-targeted block has no well assigned yet. */
export function stepNeedsWell(step: WorkflowStep): boolean {
  return BLOCK_DEFINITIONS[step.type].targetsWell && !step.params.well
}

/** Any block in the tree still missing its target well. */
export function hasUnassignedWells(steps: WorkflowStep[]): boolean {
  return steps.some(
    (s) => stepNeedsWell(s) || (s.children ? hasUnassignedWells(s.children) : false),
  )
}

/** One-line human summary of a step for compact display. */
export function describeStep(step: WorkflowStep): string {
  const well = step.params.well ? String(step.params.well) : '—'
  switch (step.type) {
    case 'aspirate':
      return `Aspirate ${step.params.volume} µL from ${well}`
    case 'dispense':
      return `Dispense ${step.params.volume} µL to ${well}`
    case 'get-media':
      return `Get ${step.params.volume} µL fresh media`
    case 'to-waste':
      return `Waste ${step.params.volume} µL`
    case 'mix':
      return `Mix ${well} · ${step.params.cycles}×`
    case 'wait':
      return `Wait ${step.params.duration} ${step.params.unit}`
    case 'loop':
      return `Loop ×${step.params.repetitions}`
    default:
      return ''
  }
}
