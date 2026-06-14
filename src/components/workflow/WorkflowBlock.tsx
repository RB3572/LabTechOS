import { Fragment, useRef, useState } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import type { WorkflowStep } from '@/types'
import { BLOCK_DEFINITIONS, WAIT_UNITS } from '@/lib/workflow'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import {
  ACCENTS,
  BLOCK_DND_TYPE,
  BLOCK_ICONS,
  type BlockDragItem,
} from './blockStyles'

// ---------------------------------------------------------------------------
// Small inline parameter editors
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  min?: number
  step?: number
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => {
            const n = e.target.value === '' ? min : Number(e.target.value)
            onChange(Number.isNaN(n) ? min : Math.max(min, n))
          }}
          className="h-7 w-[4.25rem] rounded-md border border-input bg-white px-2 text-sm font-medium text-foreground shadow-sm tnum focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  )
}

function UnitSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 rounded-md border border-input bg-white px-2 text-sm font-medium text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {WAIT_UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  )
}

function ParamsEditor({ step }: { step: WorkflowStep }) {
  const updateStepParams = useStore((s) => s.updateStepParams)
  switch (step.type) {
    case 'remove-media':
    case 'add-media':
      return (
        <NumberField
          label="Volume"
          suffix="µL"
          step={10}
          value={Number(step.params.volume)}
          onChange={(v) => updateStepParams(step.id, { volume: v })}
        />
      )
    case 'wait':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <NumberField
            label="Duration"
            value={Number(step.params.duration)}
            onChange={(v) => updateStepParams(step.id, { duration: v })}
          />
          <UnitSelect
            value={String(step.params.unit)}
            onChange={(u) => updateStepParams(step.id, { unit: u })}
          />
        </div>
      )
    case 'loop':
      return (
        <NumberField
          label="Repeat"
          suffix="times"
          min={1}
          value={Number(step.params.repetitions)}
          onChange={(v) => updateStepParams(step.id, { repetitions: v })}
        />
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Connector drawn between stacked blocks
// ---------------------------------------------------------------------------

function Connector() {
  return (
    <div className="flex flex-col items-center text-slate-300" aria-hidden>
      <div className="h-3 w-px bg-slate-300" />
      <ChevronDown className="-mt-1.5 size-3.5" />
    </div>
  )
}

/** Render an ordered list of steps with connectors between them. */
export function StepList({
  steps,
  ancestorIds = [],
}: {
  steps: WorkflowStep[]
  ancestorIds?: string[]
}) {
  return (
    <>
      {steps.map((step, i) => (
        <Fragment key={step.id}>
          {i > 0 && <Connector />}
          <WorkflowBlock step={step} ancestorIds={ancestorIds} />
        </Fragment>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Loop container — its own drop target so blocks can be nested inside
// ---------------------------------------------------------------------------

function LoopContainer({
  step,
  ancestorIds,
}: {
  step: WorkflowStep
  ancestorIds: string[]
}) {
  const addChildStep = useStore((s) => s.addChildStep)
  const moveStepToEnd = useStore((s) => s.moveStepToEnd)
  const children = step.children ?? []

  // A move is invalid if it would put a block inside itself / its own subtree.
  const invalidMove = (item: BlockDragItem) =>
    item.kind === 'move' && (item.id === step.id || ancestorIds.includes(item.id))

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: BLOCK_DND_TYPE,
      drop: (item: BlockDragItem, monitor) => {
        if (monitor.didDrop()) return
        if (invalidMove(item)) return { handled: true } // consume, no-op
        if (item.kind === 'new') addChildStep(step.id, item.blockType)
        else moveStepToEnd(item.id, step.id)
        return { handled: true }
      },
      collect: (monitor) => {
        const item = monitor.getItem() as BlockDragItem | null
        const over = monitor.isOver({ shallow: true })
        return { isOver: over && !(item ? invalidMove(item) : false) }
      },
    }),
    [step.id, ancestorIds, addChildStep, moveStepToEnd],
  )

  return (
    <div
      ref={(node) => {
        drop(node)
      }}
      className={cn(
        'mt-2.5 rounded-lg border border-dashed border-border bg-secondary/40 p-2.5 transition-colors',
        isOver && 'border-primary bg-accent/50',
      )}
    >
      {children.length > 0 ? (
        <StepList steps={children} ancestorIds={[...ancestorIds, step.id]} />
      ) : (
        <div className="py-3 text-center text-xs text-muted-foreground">
          Drop blocks here to repeat them
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A single workflow block — draggable (reorder / remove) and a drop target
// ---------------------------------------------------------------------------

export function WorkflowBlock({
  step,
  ancestorIds,
}: {
  step: WorkflowStep
  ancestorIds: string[]
}) {
  const removeStep = useStore((s) => s.removeStep)
  const moveStep = useStore((s) => s.moveStep)
  const insertStep = useStore((s) => s.insertStep)

  const def = BLOCK_DEFINITIONS[step.type]
  const Icon = BLOCK_ICONS[step.type]
  const accent = ACCENTS[def.accent]
  const isLoop = step.type === 'loop'

  const blockRef = useRef<HTMLDivElement | null>(null)
  const [edge, setEdge] = useState<'top' | 'bottom' | null>(null)

  const invalidMove = (item: BlockDragItem) =>
    item.kind === 'move' && (item.id === step.id || ancestorIds.includes(item.id))

  // --- Drag source: the grip handle moves the block; preview is the block ---
  const [{ isDragging }, drag, dragPreview] = useDrag(
    () => ({
      type: BLOCK_DND_TYPE,
      item: { kind: 'move', id: step.id } as BlockDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
      // Dropped outside every valid target → remove the block.
      end: (_item, monitor) => {
        if (!monitor.didDrop()) removeStep(step.id)
      },
    }),
    [step.id, removeStep],
  )

  // --- Drop target: reorder relative to this block / insert new block here ---
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: BLOCK_DND_TYPE,
      hover: (item: BlockDragItem, monitor) => {
        if (!monitor.isOver({ shallow: true }) || invalidMove(item)) return
        const rect = blockRef.current?.getBoundingClientRect()
        const off = monitor.getClientOffset()
        if (!rect || !off) return
        const next = off.y - rect.top < rect.height / 2 ? 'top' : 'bottom'
        setEdge((prev) => (prev === next ? prev : next))
      },
      drop: (item: BlockDragItem, monitor) => {
        if (monitor.didDrop()) return
        if (invalidMove(item)) return { handled: true } // consume, no-op
        const rect = blockRef.current?.getBoundingClientRect()
        const off = monitor.getClientOffset()
        const before = rect && off ? off.y - rect.top < rect.height / 2 : true
        if (item.kind === 'move') moveStep(item.id, step.id, before)
        else insertStep(item.blockType, step.id, before)
        return { handled: true }
      },
      collect: (monitor) => {
        const item = monitor.getItem() as BlockDragItem | null
        const over = monitor.isOver({ shallow: true })
        return { isOver: over && !(item ? invalidMove(item) : false) }
      },
    }),
    [step.id, ancestorIds, moveStep, insertStep],
  )

  const setBlockNode = (node: HTMLDivElement | null) => {
    blockRef.current = node
    drop(node)
    dragPreview(node)
  }

  return (
    <div
      ref={setBlockNode}
      className={cn(
        'group/block relative flex overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-shadow',
        isDragging && 'opacity-40',
      )}
    >
      {/* Insertion indicator */}
      {isOver && edge === 'top' && (
        <span className="absolute inset-x-0 -top-px z-10 h-0.5 rounded-full bg-primary" />
      )}
      {isOver && edge === 'bottom' && (
        <span className="absolute inset-x-0 -bottom-px z-10 h-0.5 rounded-full bg-primary" />
      )}

      {/* Accent bar */}
      <div className={cn('w-1 shrink-0', accent.bar)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          {/* Drag handle — the grip + icon + title; drag to reorder, drag out to delete */}
          <div
            ref={(node) => {
              drag(node)
            }}
            title="Drag to reorder · drag out of the list to delete"
            className="flex min-w-0 flex-1 cursor-grab items-center gap-2 py-2.5 pl-1.5 active:cursor-grabbing"
          >
            <GripVertical className="size-4 shrink-0 text-muted-foreground/30 transition-colors group-hover/block:text-muted-foreground/60" />
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
                accent.icon,
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {def.label}
            </div>
          </div>

          {isLoop && (
            <div className="shrink-0 pr-1">
              <ParamsEditor step={step} />
            </div>
          )}
          <button
            onClick={() => removeStep(step.id)}
            aria-label={`Remove ${def.label}`}
            className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {/* Leaf parameters sit under the header, aligned with the icon */}
        {!isLoop && (
          <div className="pb-2.5 pl-[2.375rem] pr-2.5">{<ParamsEditor step={step} />}</div>
        )}

        {/* Loop body */}
        {isLoop && (
          <div className="px-2.5 pb-2.5">
            <LoopContainer step={step} ancestorIds={ancestorIds} />
          </div>
        )}
      </div>
    </div>
  )
}
