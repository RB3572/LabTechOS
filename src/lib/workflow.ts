import type { BlockDefinition, BlockType, WorkflowStep } from '@/types'

// ---------------------------------------------------------------------------
// Block library — static definitions for the four protocol primitives.
// ---------------------------------------------------------------------------

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  'remove-media': {
    type: 'remove-media',
    label: 'Remove Media',
    description: 'Aspirate spent media from each well.',
    accent: 'rose',
    container: false,
    defaults: { volume: 200 },
  },
  'add-media': {
    type: 'add-media',
    label: 'Add Fresh Media',
    description: 'Dispense fresh media into each well.',
    accent: 'emerald',
    container: false,
    defaults: { volume: 200 },
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    description: 'Pause for a fixed incubation time.',
    accent: 'amber',
    container: false,
    defaults: { duration: 24, unit: 'hours' },
  },
  loop: {
    type: 'loop',
    label: 'Loop',
    description: 'Repeat the contained steps N times.',
    accent: 'violet',
    container: true,
    defaults: { repetitions: 3 },
  },
}

export const BLOCK_ORDER: BlockType[] = ['remove-media', 'add-media', 'wait', 'loop']

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
 * Operations performed per well for one pass of the protocol. Each leaf block
 * counts as one operation; a loop multiplies its children by the repetition
 * count. With one well this matches "wells × steps" for a flat protocol
 * (e.g. Remove + Add + Wait over 6 wells = 18).
 */
export function operationsPerWell(steps: WorkflowStep[]): number {
  return steps.reduce((sum, step) => {
    if (step.type === 'loop') {
      const reps = Number(step.params.repetitions) || 0
      return sum + reps * operationsPerWell(step.children ?? [])
    }
    return sum + 1
  }, 0)
}

/** Estimated operations across the whole selected well set. */
export function estimateOperations(steps: WorkflowStep[], wellCount: number): number {
  return operationsPerWell(steps) * wellCount
}

/** One-line human summary of a step for compact display. */
export function describeStep(step: WorkflowStep): string {
  switch (step.type) {
    case 'remove-media':
      return `Remove ${step.params.volume} µL`
    case 'add-media':
      return `Add ${step.params.volume} µL`
    case 'wait':
      return `Wait ${step.params.duration} ${step.params.unit}`
    case 'loop':
      return `Loop ×${step.params.repetitions}`
    default:
      return ''
  }
}
