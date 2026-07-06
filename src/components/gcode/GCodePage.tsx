import { useEffect, useRef, useState } from 'react'
import {
  Code2,
  Download,
  FlaskConical,
  LayoutPanelLeft,
  Microscope,
  MousePointerClick,
  PlayCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { usePlateConfigured, useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import { validateDeck } from '@/lib/deck'
import { computeDeckFromCalibration } from '@/lib/calibration'
import {
  type GTokenKind,
  explainLine,
  formatDuration,
  generateGcode,
  tokenizeLine,
} from '@/lib/gcode'
import { downloadTextFile } from '@/lib/cellfile'
import { Button } from '@/components/ui/button'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { cn } from '@/lib/utils'
import { BottleLoader } from './BottleLoader'

const TOKEN_COLORS: Record<GTokenKind, string> = {
  comment: '#6b7280',
  g: '#38bdf8',
  m: '#a78bfa',
  x: '#34d399',
  y: '#fbbf24',
  z: '#f472b6',
  e: '#fb7185',
  f: '#94a3b8',
  s: '#facc15',
  plain: '#e5e7eb',
}

const LEGEND: { kind: GTokenKind; label: string }[] = [
  { kind: 'g', label: 'G — motion / mode' },
  { kind: 'm', label: 'M — machine' },
  { kind: 'x', label: 'X axis' },
  { kind: 'y', label: 'Y axis' },
  { kind: 'z', label: 'Z axis' },
  { kind: 'e', label: 'E — plunger (µL)' },
  { kind: 'f', label: 'F — feed rate' },
  { kind: 'comment', label: 'Comment' },
]

const ROW_H = 20

// Virtualized, syntax-highlighted G-code listing.
function CodeViewer({
  lines,
  selected,
  onSelect,
}: {
  lines: string[]
  selected: number | null
  onSelect: (i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(640)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const overscan = 12
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - overscan)
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / ROW_H) + overscan)
  const rows: number[] = []
  for (let i = start; i < end; i++) rows.push(i)

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="h-full overflow-auto scrollbar-thin font-mono text-xs leading-5"
      style={{ background: '#0b0f17' }}
    >
      <div style={{ height: lines.length * ROW_H, position: 'relative' }}>
        {rows.map((i) => {
          const isSel = i === selected
          return (
            <div
              key={i}
              onClick={() => onSelect(i)}
              className={cn(
                'absolute inset-x-0 flex cursor-pointer items-center hover:bg-white/[0.05]',
                isSel && 'bg-sky-500/15',
              )}
              style={{ top: i * ROW_H, height: ROW_H }}
            >
              {isSel && <span className="absolute inset-y-0 left-0 w-0.5 bg-sky-400" />}
              <span className="w-12 shrink-0 select-none border-r border-white/10 pr-2 text-right text-[10px] text-slate-600">
                {i + 1}
              </span>
              <span className={cn('whitespace-pre pl-3', isSel && 'font-semibold')}>
                {tokenizeLine(lines[i]).map((t, k) => (
                  <span
                    key={k}
                    style={{
                      color: TOKEN_COLORS[t.kind],
                      fontStyle: t.kind === 'comment' ? 'italic' : undefined,
                    }}
                  >
                    {t.text}
                  </span>
                ))}
                {lines[i] === '' ? ' ' : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GateRow({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: typeof Microscope
  text: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
      <Icon className="size-5 shrink-0 text-amber-500" />
      <span className="flex-1 text-sm text-foreground">{text}</span>
      <Button variant="outline" size="sm" onClick={onClick}>
        {action}
      </Button>
    </div>
  )
}

export function GCodePage() {
  const deck = useStore((s) => s.deck)
  const plateType = useStore((s) => s.plateType)
  const routine = useStore((s) => s.routine)
  const bed = useStore((s) => s.bed)
  const captured = useStore((s) => s.calibration.captured)
  const pipetteMmPerUl = useStore((s) => s.pipette.mmPerUl)
  const gcode = useStore((s) => s.gcode)
  const setGcode = useStore((s) => s.setGcode)
  const setPage = useStore((s) => s.setPage)
  const plateConfigured = usePlateConfigured()
  const plate = PLATES[plateType]

  const validation = validateDeck(deck, plate, plateConfigured, bed)
  const deckErrors = validation.issues.filter((i) => i.level === 'error')
  const ready = plateConfigured && validation.canGenerate

  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const generate = () => {
    if (!ready) return
    setSelected(null)
    setGenerating(true)
    const nozzleZ = computeDeckFromCalibration(captured, plate).nozzleZ
    const program = generateGcode({ deck, plate, routine, nozzleZ, ulToE: pipetteMmPerUl ?? 1 })
    timer.current = window.setTimeout(() => {
      setGcode(program)
      setGenerating(false)
    }, 1950)
  }

  // --- generating ----------------------------------------------------------
  if (generating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-white to-slate-50">
        <BottleLoader />
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Translating your routine and calibrated deck into machine instructions.
        </p>
      </div>
    )
  }

  // --- nothing generated yet ----------------------------------------------
  if (!gcode) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-white to-slate-50 p-8">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Code2 className="size-6" />
          </div>
          <h2 className="mt-4 text-center text-lg font-semibold text-foreground">
            Generate G-Code
          </h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Compile the programmed routine and deck layout into a runnable printer program.
          </p>

          {ready ? (
            <>
              <div className="mt-5 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Plate</span>
                  <span className="font-medium text-foreground">{plate.name}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Deck</span>
                  <span className="font-medium text-emerald-600">Valid</span>
                </div>
              </div>
              <Button className="mt-5 w-full" onClick={generate}>
                <Sparkles className="size-4" />
                Generate G-Code
              </Button>
            </>
          ) : (
            <div className="mt-5 space-y-2">
              {!plateConfigured && (
                <GateRow
                  icon={Microscope}
                  text="No protocol routine has been defined yet."
                  action="Plate Routine"
                  onClick={() => setPage('plate-setup')}
                />
              )}
              {deckErrors.map((e, i) => (
                <GateRow
                  key={i}
                  icon={LayoutPanelLeft}
                  text={e.message}
                  action="Fix Deck"
                  onClick={() => setPage('deck-setup')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- program ready -------------------------------------------------------
  const meta = gcode.meta
  const explanation = selected !== null ? explainLine(gcode.lines[selected]) : null

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="size-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Generated Program</h3>
            <p className="text-xs text-muted-foreground tnum">
              {meta.lineCount} lines · {meta.operations} operations · ~{formatDuration(meta.durationMs)} est. runtime
            </p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTextFile(`${plateType}.gcode`, gcode.text, 'text/plain')}
          >
            <Download className="size-4" />
            Export .gcode
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage('simulation')}>
            <PlayCircle className="size-4" />
            Simulate
          </Button>
          <Button size="sm" onClick={generate} disabled={!ready}>
            <RefreshCw className="size-4" />
            Regenerate
          </Button>
        </div>
      </header>

      {/* Viewer + explanation */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="h-[45vh] w-full shrink-0 md:h-auto md:min-w-0 md:flex-1">
          <CodeViewer lines={gcode.lines} selected={selected} onSelect={setSelected} />
        </div>

        <ResizablePanel id="gcode-panel" side="left" initial={360} min={300} max={560}>
        <aside className="flex h-full w-full flex-col overflow-y-auto scrollbar-thin border-t border-border bg-white p-5 md:border-l md:border-t-0">
          {explanation ? (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Line {selected! + 1}
              </div>
              <pre className="mt-1.5 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
                {gcode.lines[selected!] || '(blank line)'}
              </pre>
              <h4 className="mt-4 text-base font-semibold text-foreground">{explanation.title}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {explanation.detail}
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <h4 className="text-sm font-semibold text-foreground">Program summary</h4>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Plate</dt>
                  <dd className="font-medium text-foreground">{plate.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Operations</dt>
                  <dd className="font-medium text-foreground tnum">{meta.operations}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Lines</dt>
                  <dd className="font-medium text-foreground tnum">{meta.lineCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Est. runtime</dt>
                  <dd className="font-medium text-foreground tnum">{formatDuration(meta.durationMs)}</dd>
                </div>
              </dl>

              <div className="mt-6 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MousePointerClick className="size-4 text-primary" />
                  Click any line
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a line in the listing to read a plain-language explanation of what it does.
                </p>
              </div>

              <div className="mt-6">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Syntax
                </div>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                  {LEGEND.map((l) => (
                    <li key={l.kind} className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{ background: TOKEN_COLORS[l.kind] }}
                      />
                      <span className="text-muted-foreground">{l.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {!ready && (
                <div className="mt-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  The deck or routine changed — regenerate to refresh this program.
                </div>
              )}
            </div>
          )}
        </aside>
        </ResizablePanel>
      </div>
    </div>
  )
}
