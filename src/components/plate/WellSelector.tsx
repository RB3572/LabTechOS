import { useMemo } from 'react'
import { MapPin, MousePointerClick } from 'lucide-react'
import type { Plate, Well, WorkflowStep } from '@/types'
import { useRoutine, useStore } from '@/store/useStore'
import { BLOCK_DEFINITIONS, describeStep, wellsUsed } from '@/lib/workflow'
import { PlateVisualization } from './PlateVisualization'

/** Locate a step anywhere in the (possibly nested) routine tree. */
function findStep(steps: WorkflowStep[], id: string | null): WorkflowStep | null {
  if (!id) return null
  for (const s of steps) {
    if (s.id === id) return s
    if (s.children) {
      const found = findStep(s.children, id)
      if (found) return found
    }
  }
  return null
}

export function WellSelector({ plate }: { plate: Plate }) {
  const routine = useRoutine()
  const selectedStepId = useStore((s) => s.selectedStepId)
  const assignWellToSelected = useStore((s) => s.assignWellToSelected)

  const selectedStep = useMemo(
    () => findStep(routine, selectedStepId),
    [routine, selectedStepId],
  )
  const def = selectedStep ? BLOCK_DEFINITIONS[selectedStep.type] : null
  const assignable = !!def?.targetsWell
  const activeWell = assignable ? String(selectedStep!.params.well ?? '') : undefined

  const used = useMemo(() => wellsUsed(routine), [routine])

  const handleWellClick = (well: Well) => {
    if (assignable) assignWellToSelected(well.id)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Assignment context — what a click will do right now */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Well Assignment
          </div>
          <div className="mt-0.5 truncate text-sm text-foreground">
            {assignable ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-primary" />
                Click a well to target{' '}
                <span className="font-medium">{describeStep(selectedStep!)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Select an aspirate, dispense, or mix block to assign its well
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground tnum">
          {used.size} / {plate.wellCount} used
        </span>
      </div>

      {/* Plate */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex h-full max-h-[58vh] w-full max-w-[620px] items-center justify-center">
          <PlateVisualization
            plate={plate}
            used={used}
            activeWell={activeWell}
            assignable={assignable}
            onWellClick={handleWellClick}
          />
        </div>
      </div>

      {/* Legend / specs */}
      <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-blue-500 ring-1 ring-inset ring-blue-700/30" />
            Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-blue-100 ring-1 ring-inset ring-blue-300" />
            Used
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-slate-100 ring-1 ring-inset ring-slate-300" />
            Empty
          </span>
        </div>
        <div className="hidden items-center gap-3 tnum sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="size-3.5" />
            Click to assign
          </span>
          <span className="text-border">·</span>
          <span>⌀ {plate.wellDiameter} mm</span>
          <span className="text-border">·</span>
          <span>{plate.pitch} mm pitch</span>
        </div>
      </div>
    </div>
  )
}
