import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  CornerDownLeft,
  Home,
  Send,
  Syringe,
  Terminal,
  Usb,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { jogGcode, parseM114, serial } from '@/lib/serial'
import { Button } from '@/components/ui/button'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { cn } from '@/lib/utils'

const FEED = 1500
const STEP_SIZES = [0.1, 1, 10]
const SYRINGE_STEPS = [10, 20, 50]
const SYRINGE_FEED_MAX = 5000 // default top of the extruder speed slider (mm/min)

interface LogEntry {
  dir: 'tx' | 'rx' | 'sys'
  text: string
}

const COMMAND_GROUPS: { group: string; items: { label: string; cmd: string; danger?: boolean }[] }[] = [
  {
    group: 'Homing',
    items: [
      { label: 'Home All', cmd: 'G28' },
      { label: 'Home XY', cmd: 'G28 X Y' },
      { label: 'Home Z', cmd: 'G28 Z' },
    ],
  },
  {
    group: 'Positioning',
    items: [
      { label: 'Get Position', cmd: 'M114' },
      { label: 'Absolute', cmd: 'G90' },
      { label: 'Relative', cmd: 'G91' },
      { label: 'Zero Here', cmd: 'G92 X0 Y0 Z0' },
    ],
  },
  {
    group: 'Machine',
    items: [
      { label: 'Motors Off', cmd: 'M84' },
      { label: 'Fan On', cmd: 'M106' },
      { label: 'Fan Off', cmd: 'M107' },
      { label: 'Firmware Info', cmd: 'M115' },
    ],
  },
  {
    group: 'Safety',
    items: [{ label: 'Emergency Stop', cmd: 'M112', danger: true }],
  },
]

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

export function MachineControlPage() {
  const cal = useStore((s) => s.calibration)
  const setCalConnected = useStore((s) => s.setCalConnected)
  const setCalHomed = useStore((s) => s.setCalHomed)
  const setToolhead = useStore((s) => s.setToolhead)
  const jogToolhead = useStore((s) => s.jogToolhead)
  const setJogStep = useStore((s) => s.setJogStep)

  const [syringeStep, setSyringeStep] = useState(20)
  const [syringeFeed, setSyringeFeed] = useState(200)
  // Slider ceiling is user-editable; kept as text so the box can be cleared mid-edit.
  const [feedMaxText, setFeedMaxText] = useState(String(SYRINGE_FEED_MAX))
  const [syringePos, setSyringePos] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [command, setCommand] = useState('')
  const [error, setError] = useState<string | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  const append = (dir: LogEntry['dir'], text: string) =>
    setLog((l) => [...l.slice(-299), { dir, text }])

  // Stream firmware responses into the console + position readout.
  useEffect(() => {
    return serial.onLine((line) => {
      append('rx', line)
      const p = parseM114(line)
      if (p) setToolhead(p)
    })
  }, [setToolhead])

  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  const connect = async () => {
    setError(null)
    try {
      await serial.connect()
      setCalConnected(true)
      append('sys', 'Connected to printer.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.')
    }
  }
  const disconnect = async () => {
    await serial.disconnect()
    setCalConnected(false)
    append('sys', 'Disconnected.')
  }

  const send = async (raw: string) => {
    const cmd = raw.trim()
    if (!cmd) return
    append('tx', cmd)
    if (cal.connected) {
      await serial.send(cmd)
    } else {
      append('sys', 'Offline — command logged but not sent. Connect a printer to drive hardware.')
    }
  }

  const submitManual = () => {
    if (!command.trim()) return
    void send(command)
    setCommand('')
  }

  const doJog = (dx: number, dy: number, dz: number) => {
    jogToolhead(dx, dy, dz)
    if (cal.connected) {
      jogGcode(dx, dy, dz, FEED).forEach((l) => {
        void serial.send(l)
        append('tx', l)
      })
    }
  }

  const home = () => {
    void send('G28')
    setCalHomed(true)
  }

  // Slider ceiling from the text box; the feed itself never exceeds it.
  const feedMax = Math.max(1, Number(feedMaxText) || SYRINGE_FEED_MAX)
  const feed = Math.min(syringeFeed, feedMax)

  // Advance (+) pushes the plunger / dispenses; retract (−) draws liquid up.
  const moveSyringe = (delta: number) => {
    setSyringePos((p) => Math.round((p + delta) * 100) / 100)
    if (cal.connected) {
      ;['M83', `G1 E${delta} F${feed}`].forEach((l) => {
        void serial.send(l)
        append('tx', l)
      })
    } else {
      append('sys', `Syringe ${delta > 0 ? 'advance' : 'retract'} ${Math.abs(delta)} mm at ${feed} mm/min (offline — not sent)`)
    }
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Controls */}
      <ResizablePanel id="machine-panel" side="right" initial={380} min={320} max={520}>
        <aside className="flex h-full w-full flex-col overflow-y-auto scrollbar-thin border-b border-border bg-white md:border-b-0 md:border-r">
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

          {/* Position readout */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis} className="rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-center">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">{axis}</div>
                <div className="font-mono text-sm font-semibold text-foreground tabular-nums">
                  {cal.toolhead[axis].toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Jog */}
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
          {!serial.supported && (
            <p className="mt-3 text-xs text-amber-600">
              Web Serial isn't available here — jogging drives the virtual position only. Use Chrome or
              Edge for hardware.
            </p>
          )}
        </section>

        {/* Syringe (extruder) */}
        <section className="border-b border-border p-5">
          <div className="mb-3 flex items-center gap-2">
            <Syringe className="size-[18px] text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Syringe</h3>
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              E {syringePos.toFixed(2)} mm
            </span>
          </div>

          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Distance
          </div>
          <div className="mb-3 flex gap-1.5">
            {SYRINGE_STEPS.map((s) => (
              <button
                key={s}
                onClick={() => setSyringeStep(s)}
                className={cn(
                  'flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
                  syringeStep === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {s} mm
              </button>
            ))}
          </div>

          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Speed
            </span>
            <span className="ml-auto font-mono text-xs font-semibold tabular-nums text-foreground">
              {feed} mm/min
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={feedMax}
            step={10}
            value={feed}
            onChange={(e) => setSyringeFeed(Number(e.target.value))}
            aria-label="Extruder speed"
            className="w-full accent-primary"
          />
          <div className="mb-3 mt-1 flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">0</span>
            <label className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">Max</span>
              <input
                type="number"
                min={1}
                step={100}
                value={feedMaxText}
                onChange={(e) => setFeedMaxText(e.target.value)}
                onBlur={() => setFeedMaxText(String(feedMax))}
                aria-label="Maximum extruder speed"
                className="h-6 w-20 rounded-md border border-input bg-white px-1.5 text-right text-[11px] font-medium text-foreground shadow-sm tabular-nums focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <span className="text-[10px] text-muted-foreground">mm/min</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 flex-col gap-0.5 py-6" onClick={() => moveSyringe(-syringeStep)}>
              <ChevronsUp className="size-4" />
              Retract
            </Button>
            <Button variant="outline" className="flex-1 flex-col gap-0.5 py-6" onClick={() => moveSyringe(syringeStep)}>
              <ChevronsDown className="size-4" />
              Advance
            </Button>
          </div>

          <Button
            variant="outline"
            className="mt-2 w-full justify-between"
            onClick={() => void send('M302 P1')}
            title="Disable the cold-extrusion temperature check so the syringe can move unheated"
          >
            Allow Cold Extrude
            <span className="font-mono text-[10px] text-muted-foreground">M302 P1</span>
          </Button>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Advance pushes the plunger (dispense); retract draws liquid up
            (aspirate). Run Allow Cold Extrude once per power-cycle so the
            firmware won't block an unheated extruder.
          </p>
        </section>
        </aside>
      </ResizablePanel>

      {/* Console + commands */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Common commands */}
        <div className="border-b border-border p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Quick Commands</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {COMMAND_GROUPS.map((g) => (
              <div key={g.group}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.group}
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.cmd}
                      onClick={() => void send(it.cmd)}
                      title={it.cmd}
                      className={cn(
                        'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        it.danger
                          ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                          : 'border-border text-foreground hover:border-primary/40 hover:bg-accent',
                      )}
                    >
                      <span>{it.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{it.cmd}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Console */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-2">
          <Terminal className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Console</span>
          <button
            onClick={() => setLog([])}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
        <div
          ref={consoleRef}
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-5 py-3 font-mono text-xs"
          style={{ background: '#0b0f17' }}
        >
          {log.length === 0 ? (
            <p className="text-slate-600">No activity yet. Send a command to begin.</p>
          ) : (
            log.map((e, i) => (
              <div key={i} className="flex gap-2 py-px">
                <span
                  className={cn(
                    'shrink-0 select-none',
                    e.dir === 'tx' ? 'text-sky-400' : e.dir === 'rx' ? 'text-emerald-400' : 'text-slate-500',
                  )}
                >
                  {e.dir === 'tx' ? '›' : e.dir === 'rx' ? '‹' : '•'}
                </span>
                <span className={cn(e.dir === 'sys' ? 'text-slate-500 italic' : 'text-slate-200')}>
                  {e.text}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Manual command */}
        <div className="flex items-center gap-2 border-t border-border bg-white p-3">
          <div className="relative flex-1">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManual()
              }}
              placeholder="Type a G-code command, e.g. G1 X100 Y100 F3000"
              className="h-10 w-full rounded-md border border-input bg-white pl-3 pr-9 font-mono text-sm text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <CornerDownLeft className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          </div>
          <Button onClick={submitManual}>
            <Send className="size-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
