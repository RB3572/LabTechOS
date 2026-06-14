// ---------------------------------------------------------------------------
// Simulation timeline — turns the generated tool-path into a scrub-able,
// watchable playback (dwell + pipetting times are compressed so a 24-hour
// incubation doesn't stall the animation).
// ---------------------------------------------------------------------------

import type { PathSeg, Pt } from '@/lib/gcode'

export interface SimStep {
  seg: PathSeg
  start: number // ms from program start (sim time)
  dur: number // ms (sim time)
}

export interface SimTimeline {
  steps: SimStep[]
  total: number
}

/** Watchable duration (ms) for one segment — long waits are clamped. */
export function simSegMs(seg: PathSeg): number {
  if (seg.kind === 'dwell') return Math.min(seg.holdMs ?? 0, 1500) + 120
  if (seg.kind === 'aspirate' || seg.kind === 'dispense') return 520
  if (seg.kind === 'home') return 480
  const dist = Math.hypot(
    seg.to.x - seg.from.x,
    seg.to.y - seg.from.y,
    seg.to.z - seg.from.z,
  )
  if (!seg.feed) return 60
  return Math.max((dist / (seg.feed / 60)) * 1000, 50)
}

export function buildTimeline(path: PathSeg[]): SimTimeline {
  const steps: SimStep[] = []
  let t = 0
  for (const seg of path) {
    const dur = simSegMs(seg)
    steps.push({ seg, start: t, dur })
    t += dur
  }
  return { steps, total: t }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface SimSample {
  pos: Pt
  carrying: boolean
  kind: PathSeg['kind']
  line: number
  index: number
}

/** Interpolate the toolhead state at sim-time `tMs`. */
export function sampleTimeline(tl: SimTimeline, tMs: number): SimSample {
  if (tl.steps.length === 0) {
    return { pos: { x: 0, y: 0, z: 0 }, carrying: false, kind: 'home', line: 0, index: 0 }
  }
  const t = Math.max(0, Math.min(tMs, tl.total))
  let idx = tl.steps.length - 1
  for (let i = 0; i < tl.steps.length; i++) {
    if (t < tl.steps[i].start + tl.steps[i].dur) {
      idx = i
      break
    }
  }
  const step = tl.steps[idx]
  const f = step.dur > 0 ? Math.max(0, Math.min(1, (t - step.start) / step.dur)) : 1
  const { from, to } = step.seg
  return {
    pos: { x: lerp(from.x, to.x, f), y: lerp(from.y, to.y, f), z: lerp(from.z, to.z, f) },
    carrying: !!step.seg.carrying,
    kind: step.seg.kind,
    line: step.seg.line,
    index: idx,
  }
}

export function kindLabel(kind: PathSeg['kind']): string {
  switch (kind) {
    case 'home':
      return 'Homing'
    case 'travel':
      return 'Traveling'
    case 'down':
      return 'Lowering'
    case 'up':
      return 'Raising'
    case 'aspirate':
      return 'Aspirating'
    case 'dispense':
      return 'Dispensing'
    case 'dwell':
      return 'Incubating'
    default:
      return ''
  }
}

export function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
