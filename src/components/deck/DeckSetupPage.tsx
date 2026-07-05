import { useRef, useState } from 'react'
import { Grid2x2, Home, Move, Move3d, Orbit, ZoomIn } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { PrinterWorkspace, type ViewApi } from './PrinterWorkspace'
import { DeckTopView } from './DeckTopView'
import { DeckPanel } from './DeckPanel'
import { DotGrid } from './DotGrid'
import { cn } from '@/lib/utils'

type View = 'perspective' | 'top'

export function DeckSetupPage() {
  const [view, setView] = useState<View>('perspective')
  const snap = useStore((s) => s.snapToGrid)
  const setSnap = useStore((s) => s.setSnapToGrid)
  const viewApi = useRef<ViewApi | null>(null)

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Workspace */}
      <div className="relative h-[52vh] w-full shrink-0 overflow-hidden bg-gradient-to-b from-white to-slate-50 md:h-full md:w-auto md:min-w-0 md:flex-1 md:shrink">
        <DotGrid className="pointer-events-none absolute inset-0 z-0 h-full w-full" />

        <div className="absolute inset-0 z-10">
          {view === 'perspective' ? <PrinterWorkspace viewApiRef={viewApi} /> : <DeckTopView />}
        </div>

        {/* View toggle */}
        <div className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-lg border border-border bg-white/90 text-[11px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur">
          {(['perspective', 'top'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Control bar — hints + snap toggle */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-white/90 px-2 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          {view === 'perspective' ? (
            <>
              <span className="flex items-center gap-1.5 px-2">
                <Move3d className="size-3.5" /> Pan
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1.5 px-2">
                <Orbit className="size-3.5" /> Orbit
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1.5 px-2">
                <ZoomIn className="size-3.5" /> Zoom
              </span>
              <span className="h-3 w-px bg-border" />
              <button
                onClick={() => viewApi.current?.setView('iso')}
                title="Reset to isometric (home) view"
                className="pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Home className="size-3.5" /> Home
              </button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 px-2">
              <Move className="size-3.5" /> Drag to reposition
            </span>
          )}

          <span className="h-3 w-px bg-border" />

          <button
            onClick={() => setSnap(!snap)}
            aria-pressed={snap}
            title="Snap objects to the 10 mm grid while dragging"
            className={cn(
              'pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition-colors',
              snap
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Grid2x2 className="size-3.5" /> Snap
          </button>
        </div>
      </div>

      {/* Configuration panel */}
      <ResizablePanel id="deck-panel" side="left" initial={360} min={300} max={560}>
        <aside className="flex h-full w-full flex-col border-l border-border bg-white">
          <DeckPanel />
        </aside>
      </ResizablePanel>
    </div>
  )
}
