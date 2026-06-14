import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  Home,
  RotateCcw,
  Usb,
  Wand2,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import { PLATE_MODELS } from '@/lib/deck'
import {
  CAL_STEPS,
  computeDeckFromCalibration,
  type Vec3,
} from '@/lib/calibration'
import { jogGcode, parseM114, serial } from '@/lib/serial'
import { Button } from '@/components/ui/button'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { DotGrid } from '@/components/deck/DotGrid'
import { CalibrationWorkspace } from './CalibrationWorkspace'
import { cn } from '@/lib/utils'

const FEED = 1500
const STEP_SIZES = [0.1, 1, 10]

function JogButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-11 items-center justify-center rounded-md border border-border bg-white text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent active:scale-95',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function CalibrationPage() {
  const cal = useStore((s) => s.calibration)
  const plateType = useStore((s) => s.plateType)
  const setCalConnected = useStore((s) => s.setCalConnected)
  const setCalHomed = useStore((s) => s.setCalHomed)
  const setToolhead = useStore((s) => s.setToolhead)
  const jogToolhead = useStore((s) => s.jogToolhead)
  const setJogStep = useStore((s) => s.setJogStep)
  const setCalStep = useStore((s) => s.setCalStep)
  const captureCalPoint = useStore((s) => s.captureCalPoint)
  const resetCalibration = useStore((s) => s.resetCalibration)
  const setDeckObject = useStore((s) => s.setDeckObject)
  const setPage = useStore((s) => s.setPage)

  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const step = cal.activeStep >= 0 ? CAL_STEPS[cal.activeStep] : null

  // Sync the displayed position with firmware M114 reports.
  useEffect(() => {
    return serial.onLine((line) => {
      const p = parseM114(line)
      if (p) setToolhead(p)
    })
  }, [setToolhead])

  const doJog = (dx: number, dy: number, dz: number) => {
    jogToolhead(dx, dy, dz)
    if (cal.connected) jogGcode(dx, dy, dz, FEED).forEach((l) => void serial.send(l))
  }

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
    // Home X/Y only — avoids the Z-probe / bed-leveling routine that a full G28
    // triggers on probe-equipped printers. Z is set manually during calibration.
    if (cal.connected) await serial.send('G28 X Y')
    setCalHomed(true)
  }

  const captureAndAdvance = () => {
    if (!step) return
    captureCalPoint(step.key)
    const next = CAL_STEPS.findIndex((s, i) => i > cal.activeStep && !cal.captured[s.key])
    setCalStep(next)
  }

  const captured = cal.captured
  const doneCount = CAL_STEPS.filter((s) => captured[s.key]).length
  const allDone = doneCount === CAL_STEPS.length

  const apply = () => {
    const result = computeDeckFromCalibration(captured, plate, model)
    if (result.plate) setDeckObject('plate', result.plate)
    if (result.freshMedia) setDeckObject('freshMedia', result.freshMedia)
    if (result.waste) setDeckObject('waste', result.waste)
    setFeedback('Calibration applied to the deck.')
    setCalStep(-1)
    setPage('deck-setup')
  }

  const fmt = (v: Vec3) => `X${v.x} Y${v.y} Z${v.z}`

  return (
    <div className="flex h-full">
      {/* 3D workspace */}
      <div className="relative min-w-0 flex-1 overflow-hidden bg-gradient-to-b from-white to-slate-50">
        <DotGrid className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
        <div className="absolute inset-0 z-10">
          <CalibrationWorkspace />
        </div>

        {/* Live position readout */}
        <div className="absolute left-4 top-4 z-20 rounded-lg border border-border bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Toolhead
          </div>
          <div className="mt-0.5 flex gap-3 font-mono text-sm font-semibold text-foreground tnum">
            <span>X {cal.toolhead.x.toFixed(1)}</span>
            <span>Y {cal.toolhead.y.toFixed(1)}</span>
            <span>Z {cal.toolhead.z.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Control panel */}
      <ResizablePanel id="cal-panel" side="left" initial={380} min={320} max={560}>
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
                cal.connected
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-secondary text-muted-foreground',
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
            <Button variant="outline" onClick={home} title="Home X / Y (skips Z probe / bed leveling)">
              <Home className="size-4" />
              Home
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          {!serial.supported && (
            <p className="mt-2 text-xs text-amber-600">
              Web Serial isn't available here — jogging still drives the virtual
              toolhead. Use Chrome or Edge to talk to real hardware.
            </p>
          )}
        </section>

        {/* Jog controls */}
        <section className="border-b border-border p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Move Printer</h3>

          <div className="mb-3 flex gap-1.5">
            {STEP_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setJogStep(s)}
                className={cn(
                  'flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
                  cal.jogStep === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {s} mm
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            {/* X / Y pad */}
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              <span />
              <JogButton onClick={() => doJog(0, cal.jogStep, 0)} className="flex-col">
                <ArrowUp className="size-4" />
                <span className="text-[9px] font-semibold">Y+</span>
              </JogButton>
              <span />
              <JogButton onClick={() => doJog(-cal.jogStep, 0, 0)}>
                <ArrowLeft className="size-4" />
              </JogButton>
              <JogButton onClick={home} className="text-muted-foreground">
                <Home className="size-4" />
              </JogButton>
              <JogButton onClick={() => doJog(cal.jogStep, 0, 0)}>
                <ArrowRight className="size-4" />
              </JogButton>
              <span />
              <JogButton onClick={() => doJog(0, -cal.jogStep, 0)} className="flex-col">
                <ArrowDown className="size-4" />
                <span className="text-[9px] font-semibold">Y-</span>
              </JogButton>
              <span />
            </div>

            {/* Z column */}
            <div className="flex w-16 flex-col gap-1.5">
              <JogButton onClick={() => doJog(0, 0, cal.jogStep)} className="flex-col">
                <ChevronsUp className="size-4" />
                <span className="text-[9px] font-semibold">Z+</span>
              </JogButton>
              <div className="flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground">
                Z
              </div>
              <JogButton onClick={() => doJog(0, 0, -cal.jogStep)} className="flex-col">
                <ChevronsDown className="size-4" />
                <span className="text-[9px] font-semibold">Z-</span>
              </JogButton>
            </div>
          </div>
        </section>

        {/* Calibration wizard */}
        <section className="flex-1 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="size-[18px] text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Calibration</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground tnum">
              {doneCount} / {CAL_STEPS.length}
            </span>
          </div>

          <ol className="space-y-1.5">
            {CAL_STEPS.map((s, i) => {
              const done = !!captured[s.key]
              const active = cal.activeStep === i
              return (
                <li key={s.key}>
                  <button
                    onClick={() => setCalStep(i)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-primary bg-accent'
                        : 'border-border hover:bg-secondary/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        done
                          ? 'bg-emerald-500 text-white'
                          : active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">{s.label}</span>
                      {done && (
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {fmt(captured[s.key]!)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          {step ? (
            <div className="mt-4 rounded-lg border border-primary/30 bg-accent/50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Step {cal.activeStep + 1} · {step.label}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground">{step.instruction}</p>
              <Button className="mt-3 w-full" onClick={captureAndAdvance}>
                <Crosshair className="size-4" />
                Set This Position
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setCalStep(CAL_STEPS.findIndex((s) => !captured[s.key]))}
              disabled={allDone}
            >
              {doneCount === 0 ? 'Begin Calibration' : 'Resume Calibration'}
            </Button>
          )}

          {feedback && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              {feedback}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Each captured point updates the deck layout instantly — the same
            coordinates appear (and save) in Manual Deck Setup.
          </p>

          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetCalibration} disabled={doneCount === 0}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button className="flex-1" onClick={apply} disabled={doneCount === 0}>
              <Wand2 className="size-4" />
              View on Deck
            </Button>
          </div>
        </section>
        </aside>
      </ResizablePanel>
    </div>
  )
}
