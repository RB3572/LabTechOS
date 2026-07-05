import { useEffect, useState } from 'react'
import {
  Check,
  Droplet,
  Home,
  Minus,
  Pipette,
  Plus,
  RotateCcw,
  Trash2,
  Usb,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import { PLATE_MODELS, RESERVOIR } from '@/lib/deck'
import { parseM114, serial } from '@/lib/serial'
import { Button } from '@/components/ui/button'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { DotGrid } from '@/components/deck/DotGrid'
import { cn } from '@/lib/utils'
import { PipetteCalibrationWorkspace } from './PipetteCalibrationWorkspace'

const E_STEPS = [0.1, 1, 5]
const FEED_E = 300

function StepHeader({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          done ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground',
        )}
      >
        {done ? <Check className="size-3" /> : n}
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

export function PipetteCalibrationPage() {
  const deck = useStore((s) => s.deck)
  const plateType = useStore((s) => s.plateType)
  const cal = useStore((s) => s.calibration)
  const pipette = useStore((s) => s.pipette)
  const setCalConnected = useStore((s) => s.setCalConnected)
  const setCalHomed = useStore((s) => s.setCalHomed)
  const setToolhead = useStore((s) => s.setToolhead)
  const setPipetteSource = useStore((s) => s.setPipetteSource)
  const setPipetteVolume = useStore((s) => s.setPipetteVolume)
  const jogExtruder = useStore((s) => s.jogExtruder)
  const setPipetteEStep = useStore((s) => s.setPipetteEStep)
  const commitPipette = useStore((s) => s.commitPipette)
  const resetPipette = useStore((s) => s.resetPipette)

  const plate = PLATES[plateType]
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => serial.onLine((line) => {
    const p = parseM114(line)
    if (p) setToolhead(p)
  }), [setToolhead])

  const connect = async () => {
    setError(null)
    try {
      await serial.connect()
      setCalConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.')
    }
  }
  const disconnect = async () => {
    await serial.disconnect()
    setCalConnected(false)
  }
  const home = async () => {
    if (cal.connected) await serial.send('G28')
    setCalHomed(true)
  }

  // Move the pipette into the chosen container so the tip sits in the liquid.
  const moveTo = (source: 'fresh' | 'waste') => {
    setFeedback(null)
    setPipetteSource(source)
    const c = source === 'fresh' ? deck.freshMedia : deck.waste
    const cx = Math.round((c.x + RESERVOIR.width / 2) * 10) / 10
    const cy = Math.round((c.y + RESERVOIR.depth / 2) * 10) / 10
    const travelZ = Math.round(
      Math.max(deck.plate.z + PLATE_MODELS[plateType].height, deck.freshMedia.height, deck.waste.height) + 10,
    )
    const dipZ = 3
    setToolhead({ x: cx, y: cy, z: dipZ })
    if (cal.connected) {
      ;['G90', `G0 Z${travelZ} F1200`, `G0 X${cx} Y${cy} F6000`, `G1 Z${dipZ} F600`, 'M114'].forEach(
        (l) => void serial.send(l),
      )
    }
  }

  const doE = (delta: number) => {
    jogExtruder(delta)
    if (cal.connected) {
      ;['M83', `G1 E${delta} F${FEED_E}`].forEach((l) => void serial.send(l))
    }
  }

  const setCalibration = () => {
    commitPipette()
    setFeedback('Pipette calibration saved.')
  }

  const travel = Math.abs(pipette.ePosition)
  const livePerUl = pipette.volumeUl > 0 && travel > 0 ? travel / pipette.volumeUl : null
  const canSet = !!pipette.source && pipette.volumeUl > 0 && pipette.ePosition !== 0
  const sourceLabel = pipette.source === 'fresh' ? 'Fresh Media' : pipette.source === 'waste' ? 'Waste' : null

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 3D workspace */}
      <div className="relative h-[46vh] w-full shrink-0 overflow-hidden bg-gradient-to-b from-white to-slate-50 md:h-full md:w-auto md:min-w-0 md:flex-1 md:shrink">
        <DotGrid className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
        <div className="absolute inset-0 z-10">
          <PipetteCalibrationWorkspace />
        </div>

        {/* Toolhead readout */}
        <div className="absolute left-4 top-4 z-20 rounded-lg border border-border bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Toolhead</div>
          <div className="mt-0.5 flex gap-3 font-mono text-sm font-semibold text-foreground tnum">
            <span>X {cal.toolhead.x.toFixed(1)}</span>
            <span>Y {cal.toolhead.y.toFixed(1)}</span>
            <span>Z {cal.toolhead.z.toFixed(1)}</span>
          </div>
        </div>

        {/* Plunger travel readout */}
        {pipette.source && (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-border bg-white/90 px-4 py-2 text-center shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plunger travel · drawing from {sourceLabel}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold text-pink-600 tnum">
              {pipette.ePosition.toFixed(2)} mm
            </div>
          </div>
        )}
      </div>

      {/* Control panel */}
      <ResizablePanel id="pipette-panel" side="left" initial={380} min={320} max={560}>
        <aside className="flex h-full w-full flex-col overflow-y-auto scrollbar-thin border-l border-border bg-white">
          {/* Connection */}
          <section className="border-b border-border p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Usb className="size-[18px] text-primary" />
                <h3 className="text-sm font-semibold text-foreground">USB Connection</h3>
              </div>
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  cal.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-muted-foreground',
                )}
              >
                <span className={cn('size-1.5 rounded-full', cal.connected ? 'bg-emerald-500' : 'bg-slate-400')} />
                {cal.connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              {cal.connected ? (
                <Button variant="outline" className="flex-1" onClick={disconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button className="flex-1" onClick={connect}>
                  <Usb className="size-4" />
                  Connect Printer
                </Button>
              )}
              <Button variant="outline" onClick={home} title="Home all axes (G28)">
                <Home className="size-4" />
                Home
              </Button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            {!serial.supported && (
              <p className="mt-2 text-xs text-amber-600">
                Web Serial isn't available here — controls drive the virtual pipette only. Use Chrome or Edge for hardware.
              </p>
            )}
          </section>

          {/* Step 1 — source */}
          <section className="border-b border-border p-5">
            <StepHeader n={1} title="Pick a container" done={!!pipette.source} />
            <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
              Move the pipette into the liquid it will draw from.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => moveTo('fresh')}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors',
                  pipette.source === 'fresh'
                    ? 'border-pink-400 bg-pink-50 text-pink-700'
                    : 'border-border text-foreground hover:bg-accent',
                )}
              >
                <Droplet className="size-5" style={{ color: '#ec4899' }} />
                Fresh Media
              </button>
              <button
                onClick={() => moveTo('waste')}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors',
                  pipette.source === 'waste'
                    ? 'border-slate-400 bg-secondary text-slate-700'
                    : 'border-border text-foreground hover:bg-accent',
                )}
              >
                <Trash2 className="size-5 text-slate-500" />
                Waste
              </button>
            </div>
          </section>

          {/* Step 2 — volume */}
          <section className="border-b border-border p-5">
            <StepHeader n={2} title="Target volume" done={pipette.volumeUl > 0} />
            <label className="block">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Volume to withdraw
              </span>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={pipette.volumeUl}
                  onChange={(e) => setPipetteVolume(Math.max(0, Number(e.target.value) || 0))}
                  className="h-10 w-full rounded-md border border-input bg-white px-3 pr-12 text-sm font-semibold text-foreground shadow-sm tnum focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  µL
                </span>
              </div>
            </label>
          </section>

          {/* Step 3 — draw */}
          <section className="border-b border-border p-5">
            <StepHeader n={3} title="Draw the liquid" done={pipette.source !== null && travel > 0} />
            <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
              Jog the plunger until exactly{' '}
              <span className="font-semibold text-foreground">{pipette.volumeUl} µL</span> has been drawn into the pipette.
            </p>

            <div className="mb-3 flex gap-1.5">
              {E_STEPS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPipetteEStep(s)}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
                    pipette.eStep === s
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s} mm
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!pipette.source} onClick={() => doE(-pipette.eStep)}>
                <Minus className="size-4" />
                Withdraw
              </Button>
              <Button variant="outline" disabled={!pipette.source} onClick={() => doE(pipette.eStep)}>
                <Plus className="size-4" />
                Expel
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Plunger travel</span>
              <span className="font-mono text-sm font-semibold text-foreground tnum">
                {pipette.ePosition.toFixed(2)} mm
              </span>
            </div>
            {livePerUl !== null && (
              <div className="mt-1.5 flex items-center justify-between px-3 text-[11px] text-muted-foreground">
                <span>Ratio</span>
                <span className="font-mono tnum">{livePerUl.toFixed(4)} mm / µL</span>
              </div>
            )}
          </section>

          {/* Set + result */}
          <section className="flex-1 p-5">
            <Button className="w-full" disabled={!canSet} onClick={setCalibration}>
              <Check className="size-4" />
              Set Calibration
            </Button>

            {feedback && (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                {feedback}
              </div>
            )}

            {pipette.mmPerUl !== null && (
              <div className="mt-4 rounded-lg border border-pink-200 bg-pink-50 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-pink-700">
                  <Pipette className="size-3.5" />
                  Calibrated
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-pink-700 tnum">
                  {pipette.mmPerUl.toFixed(4)} mm / µL
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-pink-700/80">
                  Generated G-code now converts each µL into {pipette.mmPerUl.toFixed(4)} mm of plunger travel.
                </p>
              </div>
            )}

            <Button variant="outline" className="mt-3 w-full" onClick={resetPipette} disabled={!pipette.source && pipette.ePosition === 0}>
              <RotateCcw className="size-4" />
              Reset Draw
            </Button>
          </section>
        </aside>
      </ResizablePanel>
    </div>
  )
}
