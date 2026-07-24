import { useEffect, useRef, useState } from 'react'
import type { DeckObjectKey, ObjectStatus } from '@/types'
import { usePlateConfigured, useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import {
  type ClearanceDim,
  PLATE_MODELS,
  RESERVOIR,
  clearances,
  plateFootprint,
  reservoirFootprint,
  snapValue,
  validateDeck,
} from '@/lib/deck'

const M = 32 // mm margin around the bed for the ruler + labels
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function statusColor(level: ObjectStatus['level'], accent: string) {
  if (level === 'error') return '#ef4444'
  if (level === 'warning') return '#f59e0b'
  return accent
}

// One measured clearance dimension line with end ticks + a value pill.
function ClearanceDimLine({ d }: { d: ClearanceDim }) {
  const color = d.kind === 'object' ? '#f59e0b' : '#64748b'
  const mid = (d.a + d.b) / 2
  const label = d.gap.toFixed(d.gap < 10 ? 1 : 0)
  if (d.axis === 'x') {
    const y = d.at
    return (
      <g pointerEvents="none">
        <line x1={d.a} y1={y} x2={d.b} y2={y} stroke={color} strokeWidth={0.5} />
        <line x1={d.a} y1={y - 1.8} x2={d.a} y2={y + 1.8} stroke={color} strokeWidth={0.6} />
        <line x1={d.b} y1={y - 1.8} x2={d.b} y2={y + 1.8} stroke={color} strokeWidth={0.6} />
        <rect x={mid - 8} y={y - 3.6} width={16} height={7.2} rx={1.6} fill="#fff" stroke={color} strokeWidth={0.3} />
        <text x={mid} y={y} textAnchor="middle" dominantBaseline="central" fontSize={5} fontWeight={700} fill={color} className="tnum">
          {label}
        </text>
      </g>
    )
  }
  const x = d.at
  return (
    <g pointerEvents="none">
      <line x1={x} y1={d.a} x2={x} y2={d.b} stroke={color} strokeWidth={0.5} />
      <line x1={x - 1.8} y1={d.a} x2={x + 1.8} y2={d.a} stroke={color} strokeWidth={0.6} />
      <line x1={x - 1.8} y1={d.b} x2={x + 1.8} y2={d.b} stroke={color} strokeWidth={0.6} />
      <rect x={x - 8} y={mid - 3.6} width={16} height={7.2} rx={1.6} fill="#fff" stroke={color} strokeWidth={0.3} />
      <text x={x} y={mid} textAnchor="middle" dominantBaseline="central" fontSize={5} fontWeight={700} fill={color} className="tnum">
        {label}
      </text>
    </g>
  )
}

export function DeckTopView() {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const snap = useStore((s) => s.snapToGrid)
  const plateType = useStore((s) => s.plateType)
  const setDeckObject = useStore((s) => s.setDeckObject)
  const setActiveDeckTab = useStore((s) => s.setActiveDeckTab)
  const plateConfigured = usePlateConfigured()
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]
  const v = validateDeck(deck, plate, plateConfigured, bed)

  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DeckObjectKey | null>(null)
  const [hovered, setHovered] = useState<DeckObjectKey | null>(null)
  const offset = useRef({ x: 0, y: 0 })

  const hoverProps = (key: DeckObjectKey) => ({
    onPointerOver: () => setHovered(key),
    onPointerOut: () => setHovered((c) => (c === key ? null : c)),
  })
  const n = (val: number) => val.toFixed(1)
  const toneColor = (key: DeckObjectKey) =>
    key === 'plate' ? '#2563eb' : key === 'freshMedia' ? '#ec4899' : '#475569'
  const footprintOf = (key: DeckObjectKey) =>
    key === 'plate' ? plateFootprint(deck, plate) : reservoirFootprint(deck[key])
  // Bounds of the (possibly rotated) plate — anchors its labels.
  const plateBox = plateFootprint(deck, plate)

  // grid lines
  const minorX: number[] = []
  const majorX: number[] = []
  for (let x = 0; x <= bed.x + 0.1; x += 10) (x % 50 === 0 ? majorX : minorX).push(x)
  const minorY: number[] = []
  const majorY: number[] = []
  for (let y = 0; y <= bed.y + 0.1; y += 10) (y % 50 === 0 ? majorY : minorY).push(y)
  const xTicks: number[] = []
  for (let x = 0; x <= bed.x + 0.1; x += 10) xTicks.push(x)
  const yTicks: number[] = []
  for (let y = 0; y <= bed.y + 0.1; y += 10) yTicks.push(y)

  // physical well grid (landscape, matching the real plate / STL)
  const nX = Math.max(plate.rows, plate.cols)
  const nY = Math.min(plate.rows, plate.cols)
  const gw = (nX - 1) * plate.pitch
  const gh = (nY - 1) * plate.pitch
  const wellR = plate.wellDiameter / 2
  const startX = deck.plate.x + (model.width - gw) / 2
  const startY = deck.plate.y + (model.depth - gh) / 2
  const wells: { cx: number; cy: number }[] = []
  for (let r = 0; r < nY; r++)
    for (let c = 0; c < nX; c++)
      wells.push({ cx: startX + c * plate.pitch, cy: startY + r * plate.pitch })

  // drag
  const toMM = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const begin =
    (key: DeckObjectKey, min: { x: number; y: number }) => (e: React.PointerEvent) => {
      e.stopPropagation()
      setActiveDeckTab(key)
      const p = toMM(e)
      offset.current = { x: p.x - min.x, y: p.y - min.y }
      setDragging(key)
    }

  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = toMM(e)
    const fp =
      dragging === 'plate'
        ? { w: model.width, d: model.depth }
        : { w: RESERVOIR.width, d: RESERVOIR.depth }
    let x = clamp(p.x - offset.current.x, 0, bed.x - fp.w)
    let y = clamp(p.y - offset.current.y, 0, bed.y - fp.d)
    if (snap) {
      x = clamp(snapValue(x), 0, bed.x - fp.w)
      y = clamp(snapValue(y), 0, bed.y - fp.d)
    }
    x = Math.round(x * 10) / 10
    y = Math.round(y * 10) / 10
    const cur = deck[dragging]
    if (cur.x !== x || cur.y !== y) setDeckObject(dragging, { x, y })
  }

  useEffect(() => {
    const up = () => setDragging(null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const reservoirNode = (
    key: DeckObjectKey,
    pos: { x: number; y: number },
    accent: string,
    status: ObjectStatus,
    label: string,
  ) => {
    const f = reservoirFootprint(pos)
    const stroke = statusColor(status.level, accent)
    const on = hovered === key
    const cx = f.x + f.w / 2
    const cy = f.y + f.d / 2
    return (
      <g key={key} className="cursor-grab" style={{ touchAction: 'none' }} onPointerDown={begin(key, pos)} {...hoverProps(key)}>
        {/* Round stand, with the tube bore drawn inside it */}
        <circle
          cx={cx}
          cy={cy}
          r={Math.min(f.w, f.d) / 2}
          fill="#ffffff"
          stroke={stroke}
          strokeWidth={on ? 2 : 1.1}
          style={{ transition: 'stroke-width 120ms ease-out' }}
        />
        <circle cx={cx} cy={cy} r={RESERVOIR.bore} fill={stroke} opacity={0.18} />
        {/* Toolhead target — tube centre */}
        <circle cx={cx} cy={cy} r={3.4} fill="none" stroke={accent} strokeWidth={0.8} />
        <circle cx={cx} cy={cy} r={1.4} fill={accent} />
        <text x={cx} y={f.y - 3} textAnchor="middle" fontSize={6} fontWeight={600} fill="#475569">
          {label}
        </text>
        {on && (
          <text x={cx} y={f.y - 10} textAnchor="middle" fontSize={5} fontWeight={600} fill={accent} className="tnum">
            X{n(cx)} Y{n(cy)}
          </text>
        )}
      </g>
    )
  }

  const plateStroke = statusColor(v.plate.level, '#3b82f6')

  return (
    <svg
      ref={svgRef}
      viewBox={`${-M} ${-M} ${bed.x + M * 2} ${bed.y + M * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      style={{ touchAction: 'none' }}
      onPointerMove={onMove}
    >
      <defs>
        <clipPath id="bedClip">
          <rect x={0} y={0} width={bed.x} height={bed.y} rx={6} />
        </clipPath>
        <linearGradient id="bedFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5f9ff" />
          <stop offset="100%" stopColor="#e6effd" />
        </linearGradient>
      </defs>

      {/* Bed */}
      <rect x={0} y={0} width={bed.x} height={bed.y} rx={6} fill="url(#bedFill)" />
      <g clipPath="url(#bedClip)">
        {minorX.map((x) => (
          <line key={`mx${x}`} x1={x} y1={0} x2={x} y2={bed.y} stroke="#dbeafe" strokeWidth={0.4} />
        ))}
        {minorY.map((y) => (
          <line key={`my${y}`} x1={0} y1={y} x2={bed.x} y2={y} stroke="#dbeafe" strokeWidth={0.4} />
        ))}
        {majorX.map((x) => (
          <line key={`Mx${x}`} x1={x} y1={0} x2={x} y2={bed.y} stroke="#93c5fd" strokeWidth={0.8} />
        ))}
        {majorY.map((y) => (
          <line key={`My${y}`} x1={0} y1={y} x2={bed.x} y2={y} stroke="#93c5fd" strokeWidth={0.8} />
        ))}
      </g>
      <rect x={0} y={0} width={bed.x} height={bed.y} rx={6} fill="none" stroke="#60a5fa" strokeWidth={1} />

      {/* Ruler ticks (aligned to the 10 mm snap grid) */}
      <g stroke="#1e40af">
        {xTicks.map((x) => {
          const major = x % 50 === 0
          return (
            <line
              key={`tx${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={-(major ? 5 : 2.6)}
              strokeWidth={major ? 0.9 : 0.5}
            />
          )
        })}
        {yTicks.map((y) => {
          const major = y % 50 === 0
          return (
            <line
              key={`ty${y}`}
              x1={0}
              y1={y}
              x2={-(major ? 5 : 2.6)}
              y2={y}
              strokeWidth={major ? 0.9 : 0.5}
            />
          )
        })}
      </g>

      {/* Axis numbers */}
      <g fill="#1e40af" fontSize={6.5} fontWeight={600}>
        {majorX.filter((x) => x > 0).map((x) => (
          <text key={`nx${x}`} x={x} y={-8} textAnchor="middle">
            {x}
          </text>
        ))}
        {majorY.filter((y) => y > 0).map((y) => (
          <text key={`ny${y}`} x={-8} y={y} textAnchor="end" dominantBaseline="middle">
            {y}
          </text>
        ))}
      </g>

      {/* Origin datum + axis labels */}
      <circle cx={0} cy={0} r={2.2} fill="#1d4ed8" />
      <text x={-8} y={-8} textAnchor="middle" fontSize={7} fontWeight={700} fill="#1d4ed8">
        0
      </text>
      <text x={bed.x} y={-18} textAnchor="end" fontSize={6.5} fontWeight={700} fill="#1e3a8a">
        X (mm) →
      </text>
      <text
        x={-18}
        y={bed.y}
        textAnchor="end"
        fontSize={6.5}
        fontWeight={700}
        fill="#1e3a8a"
        transform={`rotate(-90 -18 ${bed.y})`}
      >
        Y (mm) →
      </text>

      {/* Drag landing preview — occupied snap cells + ruler projector lines */}
      {dragging && (() => {
        const f = footprintOf(dragging)
        const accent = toneColor(dragging)
        const cx0 = Math.floor(f.x / 10) * 10
        const cy0 = Math.floor(f.y / 10) * 10
        const cx1 = Math.ceil((f.x + f.w) / 10) * 10
        const cy1 = Math.ceil((f.y + f.d) / 10) * 10
        return (
          <g pointerEvents="none">
            {/* occupied grid cells */}
            <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0} fill={accent} opacity={0.08} />
            {/* ghost footprint outline */}
            <rect x={f.x} y={f.y} width={f.w} height={f.d} rx={4} fill="none" stroke={accent} strokeWidth={0.9} strokeDasharray="3 2" />
            {/* projector witness lines to the rulers */}
            <line x1={f.x} y1={-5} x2={f.x} y2={f.y} stroke={accent} strokeWidth={0.6} strokeDasharray="2 2" />
            <line x1={-5} y1={f.y} x2={f.x} y2={f.y} stroke={accent} strokeWidth={0.6} strokeDasharray="2 2" />
            {/* live value pills at the rulers */}
            <g>
              <rect x={f.x - 9} y={-15} width={18} height={8} rx={2} fill={accent} />
              <text x={f.x} y={-9.5} textAnchor="middle" fontSize={5} fontWeight={700} fill="#fff" className="tnum">{n(f.x)}</text>
            </g>
            <g>
              <rect x={-22} y={f.y - 4} width={18} height={8} rx={2} fill={accent} />
              <text x={-13} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={5} fontWeight={700} fill="#fff" className="tnum">{n(f.y)}</text>
            </g>
          </g>
        )
      })()}

      {/* Culture plate */}
      <g className="cursor-grab" style={{ touchAction: 'none' }} onPointerDown={begin('plate', deck.plate)} {...hoverProps('plate')}>
        {/* Body + wells are laid out square, then spun about the plate's near
            corner — the same transform G-code applies to well centres. */}
        <g
          transform={
            deck.plate.rotation
              ? `rotate(${deck.plate.rotation} ${deck.plate.x} ${deck.plate.y})`
              : undefined
          }
        >
          <rect
            x={deck.plate.x}
            y={deck.plate.y}
            width={model.width}
            height={model.depth}
            rx={4}
            fill="#ffffff"
            stroke={plateStroke}
            strokeWidth={hovered === 'plate' ? 2.2 : 1.2}
            style={{ transition: 'stroke-width 120ms ease-out' }}
          />
          {wells.map((w, i) => (
            <circle key={i} cx={w.cx} cy={w.cy} r={wellR} fill="#eff6ff" stroke="#bfdbfe" strokeWidth={0.4} />
          ))}
        </g>
        {/* Labels stay upright and ride the rotated bounding box. */}
        <text x={plateBox.x + plateBox.w / 2} y={plateBox.y - 3} textAnchor="middle" fontSize={6} fontWeight={600} fill="#475569">
          Culture Plate · {plate.wellCount}-well
        </text>
        {hovered === 'plate' && (
          <text x={plateBox.x + plateBox.w / 2} y={plateBox.y - 10} textAnchor="middle" fontSize={5} fontWeight={600} fill="#2563eb" className="tnum">
            X{n(deck.plate.x)} Y{n(deck.plate.y)} Z{n(deck.plate.z)}
            {deck.plate.rotation ? ` ${n(deck.plate.rotation)}°` : ''}
          </text>
        )}
      </g>

      {reservoirNode('freshMedia', deck.freshMedia, '#ec4899', v.freshMedia, 'Fresh Media')}
      {reservoirNode('waste', deck.waste, '#475569', v.waste, 'Waste')}

      {/* Clearance dimension lines for the active (hovered/dragged) object */}
      {(dragging ?? hovered) && (() => {
        const key = (dragging ?? hovered)!
        const af = footprintOf(key)
        const others = (['plate', 'freshMedia', 'waste'] as DeckObjectKey[])
          .filter((k) => k !== key)
          .map(footprintOf)
        return (
          <g key={`clear-${key}`} style={{ animation: 'cs-fade-in 0.18s ease-out' }}>
            {clearances(af, others, bed).map((d, i) => (
              <ClearanceDimLine key={i} d={d} />
            ))}
          </g>
        )
      })()}

      {/* Footprint readout */}
      <text x={0} y={bed.y + 16} fontSize={6} fill="#94a3b8">
        Build area {bed.x} × {bed.y} mm · top view
      </text>
    </svg>
  )
}
