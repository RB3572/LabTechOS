import { useDragLayer, useDrop } from 'react-dnd'
import { Layers, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { useRoutine, useStore } from '@/store/useStore'
import { countOperations, countSteps, wellsUsed } from '@/lib/workflow'
import { cn } from '@/lib/utils'
import { BlockLibrary } from './BlockLibrary'
import { StepList } from './WorkflowBlock'
import { BLOCK_DND_TYPE, type BlockDragItem } from './blockStyles'

/**
 * While a placed block is being dragged, surface the "drag out to delete"
 * affordance. Kept in its own component so the per-frame drag updates don't
 * re-render the whole builder.
 */
function DragHint() {
  const active = useDragLayer((monitor) => {
    const item = monitor.getItem() as BlockDragItem | null
    return monitor.isDragging() && item?.kind === 'move'
  })
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-x-3 top-2 z-20 flex items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50/95 py-1 text-[11px] font-medium text-rose-600 shadow-sm">
      <Trash2 className="size-3.5" />
      Drop outside the list to delete
    </div>
  )
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2.5 text-center shadow-sm">
      <div
        className={cn(
          'text-xl font-semibold tabular-nums',
          accent ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

export function WorkflowBuilder() {
  const addStep = useStore((s) => s.addStep)
  const moveStepToEnd = useStore((s) => s.moveStepToEnd)
  const workflow = useRoutine()

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: BLOCK_DND_TYPE,
      // Drops that land on the canvas background (not on a specific block):
      // new blocks append; existing blocks move to the end of the top level.
      drop: (item: BlockDragItem, monitor) => {
        if (monitor.didDrop()) return
        if (item.kind === 'new') addStep(item.blockType)
        else moveStepToEnd(item.id, null)
        return { handled: true }
      },
      collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
    }),
    [addStep, moveStepToEnd],
  )

  const stepCount = countSteps(workflow)
  const operations = countOperations(workflow)
  const wellCount = wellsUsed(workflow).size

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <WorkflowIcon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Workflow Builder</h3>
        <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground tnum">
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
      </div>

      {/* Block library / palette */}
      <div className="border-y border-border bg-secondary/30 px-4 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Block Library
        </div>
        <BlockLibrary />
      </div>

      {/* Hint — how per-well blocks get their target */}
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
        Select an aspirate / dispense / mix block, then click a well on the map
        to target it.
      </div>

      {/* Canvas (drop target) */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DragHint />
        <div
          ref={(node) => {
            drop(node)
          }}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-4 pt-1 transition-colors',
            isOver && 'bg-accent/30',
          )}
        >
          {workflow.length > 0 ? (
            <StepList steps={workflow} />
          ) : (
          <div
            className={cn(
              'flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 text-center transition-colors',
              isOver && 'border-primary bg-accent/40',
            )}
          >
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Layers className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Build your protocol
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag blocks from the library above, or click a block to add it to
              the canvas.
            </p>
          </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="border-t border-border bg-secondary/30 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Workflow Summary
        </div>
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="Wells Used" value={wellCount} />
          <SummaryStat label="Steps" value={stepCount} />
          <SummaryStat label="Operations" value={operations} accent />
        </div>
      </div>
    </div>
  )
}
