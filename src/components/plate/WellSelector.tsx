import { useEffect, useMemo, useRef } from 'react'
import { MousePointerClick, X } from 'lucide-react'
import type { Plate, Well } from '@/types'
import { useStore } from '@/store/useStore'
import { formatWellRanges, generateWells } from '@/lib/plate'
import { Button } from '@/components/ui/button'
import { PlateVisualization } from './PlateVisualization'

function wellsInRect(wells: Well[], a: Well, b: Well): string[] {
  const r0 = Math.min(a.row, b.row)
  const r1 = Math.max(a.row, b.row)
  const c0 = Math.min(a.col, b.col)
  const c1 = Math.max(a.col, b.col)
  return wells
    .filter((w) => w.row >= r0 && w.row <= r1 && w.col >= c0 && w.col <= c1)
    .map((w) => w.id)
}

export function WellSelector({ plate }: { plate: Plate }) {
  const selectedWells = useStore((s) => s.selectedWells)
  const setSelection = useStore((s) => s.setSelection)
  const selectRow = useStore((s) => s.selectRow)
  const selectColumn = useStore((s) => s.selectColumn)
  const clearSelection = useStore((s) => s.clearSelection)

  const wells = useMemo(() => generateWells(plate), [plate])
  const selected = useMemo(() => new Set(selectedWells), [selectedWells])

  // --- Drag-selection bookkeeping (kept in refs so moves don't re-render) ---
  const dragging = useRef(false)
  const mode = useRef<'paint' | 'rect'>('paint')
  const paintAdd = useRef(true)
  const base = useRef<Set<string>>(new Set())
  const painted = useRef<Set<string>>(new Set())
  const rectAnchor = useRef<Well | null>(null)
  const lastAnchor = useRef<Well | null>(null)

  // End any drag when the mouse is released anywhere on the page.
  useEffect(() => {
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const commitPaint = () => {
    const next = new Set(base.current)
    for (const id of painted.current) {
      if (paintAdd.current) next.add(id)
      else next.delete(id)
    }
    setSelection([...next])
  }

  const commitRect = (current: Well) => {
    const next = new Set(base.current)
    if (rectAnchor.current) {
      for (const id of wellsInRect(wells, rectAnchor.current, current)) next.add(id)
    }
    setSelection([...next])
  }

  const handleWellMouseDown = (well: Well, e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const additive = e.metaKey || e.ctrlKey
    const range = e.shiftKey

    if (range && lastAnchor.current) {
      mode.current = 'rect'
      base.current = new Set(selectedWells)
      rectAnchor.current = lastAnchor.current
      commitRect(well)
      return
    }

    mode.current = 'paint'
    painted.current = new Set([well.id])
    rectAnchor.current = well
    lastAnchor.current = well

    if (additive) {
      base.current = new Set(selectedWells)
      paintAdd.current = !selected.has(well.id) // toggle: remove if already on
    } else {
      base.current = new Set()
      paintAdd.current = true
    }
    commitPaint()
  }

  const handleWellMouseEnter = (well: Well) => {
    if (!dragging.current) return
    if (mode.current === 'rect') {
      commitRect(well)
    } else {
      painted.current.add(well.id)
      commitPaint()
    }
  }

  const summary = formatWellRanges(selectedWells)

  return (
    <div className="flex h-full flex-col">
      {/* Selected wells readout — shown above the plate */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Selected Wells
          </div>
          <div className="mt-0.5 truncate font-mono text-sm text-foreground">
            {summary || (
              <span className="font-sans text-muted-foreground">
                None — click, drag, or use the row / column headers
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground tnum">
            {selectedWells.length} / {plate.wellCount}
          </span>
          {selectedWells.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Plate */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex h-full max-h-[58vh] w-full max-w-[620px] items-center justify-center">
          <PlateVisualization
            plate={plate}
            selected={selected}
            onWellMouseDown={handleWellMouseDown}
            onWellMouseEnter={handleWellMouseEnter}
            onRowLabel={(r, e) => selectRow(r, e.metaKey || e.ctrlKey)}
            onColLabel={(c, e) => selectColumn(c, e.metaKey || e.ctrlKey)}
          />
        </div>
      </div>

      {/* Legend / specs */}
      <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-blue-500 ring-1 ring-inset ring-blue-700/30" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-slate-100 ring-1 ring-inset ring-slate-300" />
            Empty
          </span>
        </div>
        <div className="hidden items-center gap-3 tnum sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="size-3.5" />
            Drag to multi-select
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
