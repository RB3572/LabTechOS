import { useState } from 'react'
import {
  Box,
  Droplet,
  LayoutGrid,
  type LucideIcon,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { DeckObjectKey, DeckTab, ObjectStatus } from '@/types'
import { usePlateConfigured, useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import { PLATE_MODELS, validateDeck } from '@/lib/deck'
import { downloadTextFile, serializeConfig } from '@/lib/cellfile'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

function CoordField({
  label,
  value,
  onChange,
  readOnly,
  suffix,
}: {
  label: string
  value: number
  onChange?: (v: number) => void
  readOnly?: boolean
  suffix?: string
}) {
  return (
    <label className="block">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative mt-1">
        <input
          type="number"
          step="0.5"
          value={value}
          readOnly={readOnly}
          onChange={(e) => {
            const n = Number(e.target.value)
            onChange?.(Number.isNaN(n) ? 0 : n)
          }}
          className={cn(
            'h-9 w-full rounded-md border border-input px-2.5 text-sm font-medium text-foreground shadow-sm tnum focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            readOnly ? 'cursor-default bg-secondary/60 text-muted-foreground' : 'bg-white',
            suffix && 'pr-9',
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

const STATUS_STYLES: Record<ObjectStatus['level'], { dot: string; text: string }> = {
  valid: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-600' },
  error: { dot: 'bg-rose-500', text: 'text-rose-600' },
}

function StatusLine({ status }: { status: ObjectStatus }) {
  const s = STATUS_STYLES[status.level]
  return (
    <div className={cn('mt-4 flex items-center gap-1.5 text-xs font-medium', s.text)}>
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {status.label}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, slot }: { icon: LucideIcon; title: string; slot?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-[18px] text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {slot && (
        <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {slot}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS: { key: DeckTab; label: string; icon: LucideIcon }[] = [
  { key: 'plate', label: 'Plate', icon: LayoutGrid },
  { key: 'freshMedia', label: 'Media', icon: Droplet },
  { key: 'waste', label: 'Waste', icon: Trash2 },
  { key: 'printer', label: 'Printer', icon: Box },
]

// Common FDM printer build volumes (mm). The Ender 3 SE is the default.
const PRINTER_PRESETS: { label: string; x: number; y: number; z: number }[] = [
  { label: 'Ender 3 SE', x: 220, y: 220, z: 250 },
  { label: 'Ender 3 / V2', x: 220, y: 220, z: 250 },
  { label: 'Ender 5', x: 220, y: 220, z: 300 },
  { label: 'CR-10', x: 300, y: 300, z: 400 },
  { label: 'Prusa i3 MK3S', x: 250, y: 210, z: 210 },
]

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function DeckPanel() {
  const deck = useStore((s) => s.deck)
  const bed = useStore((s) => s.bed)
  const plateType = useStore((s) => s.plateType)
  const setDeckObject = useStore((s) => s.setDeckObject)
  const setBed = useStore((s) => s.setBed)
  const tab = useStore((s) => s.activeDeckTab)
  const setTab = useStore((s) => s.setActiveDeckTab)
  const getConfig = useStore((s) => s.getConfig)
  const plateConfigured = usePlateConfigured()
  const plate = PLATES[plateType]
  const model = PLATE_MODELS[plateType]

  const validation = validateDeck(deck, plate, plateConfigured, bed)
  const errors = validation.issues.filter((i) => i.level === 'error')
  const presetMatch = PRINTER_PRESETS.find((p) => p.x === bed.x && p.y === bed.y && p.z === bed.z)
  const [feedback, setFeedback] = useState<string | null>(null)

  const set =
    (key: DeckObjectKey, axis: 'x' | 'y' | 'z' | 'height' | 'rotation') => (val: number) => {
      setDeckObject(key, { [axis]: val })
      setFeedback(null)
    }

  const handleSave = () => {
    const cfg = getConfig()
    downloadTextFile(`${cfg.plateType}-protocol.cell`, serializeConfig(cfg, new Date().toISOString()))
    setFeedback('Saved as a .cell file to your downloads.')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-5">
        {tab === 'plate' && (
          <section>
            <SectionHeader icon={LayoutGrid} title="Culture Plate" slot="Slot A1" />
            <div className="grid grid-cols-2 gap-3">
              <CoordField label="X Axis (L)" suffix="mm" value={deck.plate.x} onChange={set('plate', 'x')} />
              <CoordField label="Y Axis (W)" suffix="mm" value={deck.plate.y} onChange={set('plate', 'y')} />
              <CoordField label="Z Offset" suffix="mm" value={deck.plate.z} onChange={set('plate', 'z')} />
              <CoordField label="Height (H)" suffix="mm" value={model.height} readOnly />
              <CoordField
                label="Rotation"
                suffix="°"
                value={deck.plate.rotation}
                onChange={set('plate', 'rotation')}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {plate.wellCount}-well plate · footprint {model.width} × {model.depth} mm.
              Rotation (counter-clockwise about the near corner) is solved from the
              two corner wells during calibration — the plate needn't sit square.
            </p>
            <StatusLine status={validation.plate} />
          </section>
        )}

        {tab === 'freshMedia' && (
          <section>
            <SectionHeader icon={Droplet} title="Fresh Media" slot="Slot B1" />
            <div className="grid grid-cols-2 gap-3">
              <CoordField label="X Axis (L)" suffix="mm" value={deck.freshMedia.x} onChange={set('freshMedia', 'x')} />
              <CoordField label="Y Axis (W)" suffix="mm" value={deck.freshMedia.y} onChange={set('freshMedia', 'y')} />
              <CoordField label="Height (H)" suffix="mm" value={deck.freshMedia.height} onChange={set('freshMedia', 'height')} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Container height — the pipette retracts above this to clear the
              reservoir rim during transfers.
            </p>
            <StatusLine status={validation.freshMedia} />
          </section>
        )}

        {tab === 'waste' && (
          <section>
            <SectionHeader icon={Trash2} title="Waste Hub" slot="Slot C1" />
            <div className="grid grid-cols-2 gap-3">
              <CoordField label="X Axis (L)" suffix="mm" value={deck.waste.x} onChange={set('waste', 'x')} />
              <CoordField label="Y Axis (W)" suffix="mm" value={deck.waste.y} onChange={set('waste', 'y')} />
              <CoordField label="Height (H)" suffix="mm" value={deck.waste.height} onChange={set('waste', 'height')} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Container height — the pipette retracts above this to clear the
              waste rim during transfers.
            </p>
            <StatusLine status={validation.waste} />
          </section>
        )}

        {tab === 'printer' && (
          <section>
            <SectionHeader icon={Box} title="Build Volume" slot="Printer" />

            <label className="block">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Printer preset
              </span>
              <select
                value={presetMatch?.label ?? 'custom'}
                onChange={(e) => {
                  const p = PRINTER_PRESETS.find((pr) => pr.label === e.target.value)
                  if (p) setBed({ x: p.x, y: p.y, z: p.z })
                }}
                className="mt-1 h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm font-medium text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {PRINTER_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} · {p.x} × {p.y} × {p.z} mm
                  </option>
                ))}
                {!presetMatch && <option value="custom">Custom · {bed.x} × {bed.y} × {bed.z} mm</option>}
              </select>
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <CoordField label="Length (X)" suffix="mm" value={bed.x} onChange={(v) => setBed({ x: v })} />
              <CoordField label="Width (Y)" suffix="mm" value={bed.y} onChange={(v) => setBed({ y: v })} />
              <CoordField label="Height (Z)" suffix="mm" value={bed.z} onChange={(v) => setBed({ z: v })} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Pick a preset or set the printable area manually. All deck objects
              must fit within these bounds or they'll be flagged out of bounds.
            </p>
          </section>
        )}
      </div>

      {/* Footer — issues + save */}
      <div className="border-t border-border p-5">
        {errors.length > 0 && (
          <ul className="mb-3 space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-rose-600">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {e.message}
              </li>
            ))}
          </ul>
        )}

        {feedback && (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {feedback}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={handleSave}>
          <Save className="size-4" />
          Save Configuration
        </Button>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Exports a <span className="font-mono">.cell</span> file with this deck layout and the
          programmed routine. Generate G-Code from the G-Code tab.
        </p>

        <div className="mt-4 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          <span>Unit: Millimeter</span>
          <span>Build 2023.11</span>
        </div>
      </div>
    </div>
  )
}
