import { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Pause, Play, PlayCircle, SkipBack } from 'lucide-react'
import { useStore } from '@/store/useStore'
import {
  type SimSample,
  buildTimeline,
  formatClock,
  kindLabel,
  sampleTimeline,
} from '@/lib/sim'
import { Button } from '@/components/ui/button'
import { DotGrid } from '@/components/deck/DotGrid'
import { cn } from '@/lib/utils'
import { SimulationWorkspace } from './SimulationWorkspace'

const SPEEDS = [0.5, 1, 2, 4, 8]

const KIND_COLOR: Record<string, string> = {
  Aspirating: '#ec4899',
  Dispensing: '#10b981',
  Traveling: '#0ea5e9',
  Lowering: '#6366f1',
  Raising: '#6366f1',
  Incubating: '#f59e0b',
  Homing: '#64748b',
}

export function SimulationPage() {
  const gcode = useStore((s) => s.gcode)
  const setPage = useStore((s) => s.setPage)

  const timeline = useMemo(() => buildTimeline(gcode?.path ?? []), [gcode])

  const tRef = useRef(0)
  const playingRef = useRef(false)
  const speedRef = useRef(1)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [uiTime, setUiTime] = useState(0)
  const [sample, setSample] = useState<SimSample | null>(null)

  // Reset transport whenever a new program loads.
  useEffect(() => {
    tRef.current = 0
    playingRef.current = false
    setPlaying(false)
    setUiTime(0)
    setSample(sampleTimeline(timeline, 0))
  }, [timeline])

  if (!gcode) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-white to-slate-50 p-8">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <PlayCircle className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Nothing to simulate yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a program from the G-Code tab, then replay the toolhead motion here.
          </p>
          <Button className="mt-5" onClick={() => setPage('g-code')}>
            <Code2 className="size-4" />
            Go to G-Code
          </Button>
        </div>
      </div>
    )
  }

  const togglePlay = () => {
    if (!playingRef.current && tRef.current >= timeline.total - 1) {
      tRef.current = 0
      setUiTime(0)
    }
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const rewind = () => {
    tRef.current = 0
    setUiTime(0)
    setSample(sampleTimeline(timeline, 0))
  }

  const changeSpeed = (v: number) => {
    speedRef.current = v
    setSpeed(v)
  }

  const seek = (v: number) => {
    tRef.current = v
    setUiTime(v)
    setSample(sampleTimeline(timeline, v))
  }

  const label = sample ? kindLabel(sample.kind) : ''
  const currentLine = sample ? gcode.lines[sample.line] : ''
  const progress = timeline.total > 0 ? (uiTime / timeline.total) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-white to-slate-50">
        <DotGrid className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
        <div className="absolute inset-0 z-10">
          <SimulationWorkspace
            timeline={timeline}
            tRef={tRef}
            playingRef={playingRef}
            speedRef={speedRef}
            onTick={(t, s) => {
              setUiTime(t)
              setSample(s)
            }}
            onEnded={() => setPlaying(false)}
          />
        </div>

        {/* Current action chip */}
        {label && (
          <div className="absolute left-4 top-4 z-20 rounded-lg border border-border bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: KIND_COLOR[label] ?? '#64748b' }}
              />
              <span className="text-sm font-semibold text-foreground">{label}</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{currentLine}</div>
          </div>
        )}
      </div>

      {/* Media transport bar */}
      <div className="flex items-center gap-4 border-t border-border bg-white px-5 py-3">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={rewind} title="Rewind to start">
            <SkipBack className="size-4" />
          </Button>
          <Button size="icon" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        </div>

        {/* Scrubber */}
        <div className="flex flex-1 items-center gap-3">
          <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {formatClock(uiTime)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, timeline.total)}
            step={1}
            value={uiTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--secondary)) ${progress}%)`,
            }}
          />
          <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatClock(timeline.total)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors',
                speed === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
