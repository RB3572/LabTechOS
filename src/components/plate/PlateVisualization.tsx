import { useMemo } from 'react'
import type { Plate, Well } from '@/types'
import { generateWells, getPlateGeometry } from '@/lib/plate'
import { cn } from '@/lib/utils'

interface PlateVisualizationProps {
  plate: Plate
  selected: Set<string>
  onWellMouseDown: (well: Well, e: React.MouseEvent) => void
  onWellMouseEnter: (well: Well, e: React.MouseEvent) => void
  onRowLabel: (rowIndex: number, e: React.MouseEvent) => void
  onColLabel: (colIndex: number, e: React.MouseEvent) => void
}

/** Rounded rectangle with a chamfered top-left (A1) corner — the classic SBS look. */
function platePath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  ch: number,
): string {
  return [
    `M ${x + ch} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + ch}`,
    'Z',
  ].join(' ')
}

export function PlateVisualization({
  plate,
  selected,
  onWellMouseDown,
  onWellMouseEnter,
  onRowLabel,
  onColLabel,
}: PlateVisualizationProps) {
  const geo = useMemo(() => getPlateGeometry(plate), [plate])
  const wells = useMemo(() => generateWells(plate), [plate])

  const strokeW = Math.max(0.3, geo.radius * 0.06)
  const body = geo.body

  return (
    <svg
      viewBox={`0 0 ${geo.viewWidth} ${geo.viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full no-select touch-none"
      role="group"
      aria-label={`${plate.name} well map`}
    >
      <defs>
        {/* Well depth — concentric radial gradients give a recessed look */}
        <radialGradient id="wellEmpty" cx="42%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="78%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </radialGradient>
        <radialGradient id="wellHover" cx="42%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#eff6ff" />
          <stop offset="100%" stopColor="#dbeafe" />
        </radialGradient>
        <radialGradient id="wellSelected" cx="40%" cy="35%" r="72%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="60%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </radialGradient>
        <linearGradient id="plateBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>
        <filter id="plateShadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow
            dx="0"
            dy={geo.diameter * 0.12}
            stdDeviation={geo.diameter * 0.12}
            floodColor="#0f172a"
            floodOpacity="0.08"
          />
        </filter>
      </defs>

      {/* Plate body */}
      <path
        d={platePath(body.x, body.y, body.w, body.h, body.corner, body.chamfer)}
        fill="url(#plateBody)"
        stroke="#cbd5e1"
        strokeWidth={strokeW * 1.4}
        filter="url(#plateShadow)"
      />
      {/* Inner rim */}
      <path
        d={platePath(
          body.x + strokeW * 2,
          body.y + strokeW * 2,
          body.w - strokeW * 4,
          body.h - strokeW * 4,
          body.corner - strokeW,
          body.chamfer - strokeW,
        )}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={strokeW}
      />

      {/* Column labels (1..N) */}
      {plate.colLabels.map((label, c) => {
        const pos = geo.colLabelPos(c)
        return (
          <g
            key={`col-${label}`}
            data-col-label={label}
            className="group cursor-pointer"
            onClick={(e) => onColLabel(c, e)}
          >
            <rect
              x={pos.x - geo.pitch / 2}
              y={0}
              width={geo.pitch}
              height={geo.gutter}
              fill="transparent"
            />
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={geo.labelFont}
              className="fill-slate-400 font-semibold transition-colors group-hover:fill-blue-600"
            >
              {label}
            </text>
          </g>
        )
      })}

      {/* Row labels (A..H) */}
      {plate.rowLabels.map((label, r) => {
        const pos = geo.rowLabelPos(r)
        return (
          <g
            key={`row-${label}`}
            data-row-label={label}
            className="group cursor-pointer"
            onClick={(e) => onRowLabel(r, e)}
          >
            <rect
              x={0}
              y={pos.y - geo.pitch / 2}
              width={geo.gutter}
              height={geo.pitch}
              fill="transparent"
            />
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={geo.labelFont}
              className="fill-slate-400 font-semibold transition-colors group-hover:fill-blue-600"
            >
              {label}
            </text>
          </g>
        )
      })}

      {/* Wells */}
      {wells.map((well) => {
        const { cx, cy } = geo.center(well.row, well.col)
        const isSelected = selected.has(well.id)
        return (
          <g key={well.id}>
            <circle
              cx={cx}
              cy={cy}
              r={geo.radius}
              strokeWidth={strokeW}
              data-well={well.id}
              aria-label={`Well ${well.id}`}
              onMouseDown={(e) => onWellMouseDown(well, e)}
              onMouseEnter={(e) => onWellMouseEnter(well, e)}
              className={cn(
                'cursor-pointer transition-[fill,stroke] duration-100',
                isSelected
                  ? '[fill:url(#wellSelected)] stroke-blue-700'
                  : '[fill:url(#wellEmpty)] stroke-slate-300 hover:[fill:url(#wellHover)] hover:stroke-blue-400',
              )}
            />
            {geo.showWellIds && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={geo.wellLabelFont}
                className={cn(
                  'pointer-events-none font-medium',
                  isSelected ? 'fill-white' : 'fill-slate-400',
                )}
              >
                {well.id}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
