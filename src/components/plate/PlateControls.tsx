import { Grid3x3, LayoutGrid } from 'lucide-react'
import type { Plate, PlateType } from '@/types'
import { useStore } from '@/store/useStore'
import { PLATE_OPTIONS } from '@/lib/plate'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tnum">{value}</span>
    </div>
  )
}

export function PlateControls({ plate }: { plate: Plate }) {
  const plateType = useStore((s) => s.plateType)
  const setPlateType = useStore((s) => s.setPlateType)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin">
      {/* Labware */}
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <LayoutGrid className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Labware</h3>
        </div>

        <Label htmlFor="plate-type">Plate Type</Label>
        <Select
          id="plate-type"
          className="mt-1.5"
          value={plateType}
          onValueChange={(v) => setPlateType(v as PlateType)}
          options={PLATE_OPTIONS}
        />

        {/* Mini plate glyph */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-white text-primary shadow-sm ring-1 ring-inset ring-border">
            <Grid3x3 className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">{plate.name}</div>
            <div className="text-xs text-muted-foreground">{plate.vendor}</div>
          </div>
        </div>
      </section>

      {/* Specifications */}
      <section className="rounded-lg border border-border p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Specifications
        </div>
        <div className="divide-y divide-border">
          <SpecRow label="Format" value={`${plate.rows} × ${plate.cols}`} />
          <SpecRow label="Wells" value={String(plate.wellCount)} />
          <SpecRow label="Well diameter" value={`${plate.wellDiameter} mm`} />
          <SpecRow label="Pitch" value={`${plate.pitch} mm`} />
          <SpecRow label="Working vol." value={`${plate.workingVolume} µL`} />
        </div>
      </section>

      {/* How-to */}
      <section>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Building a Routine
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add blocks in the builder to the right. Each{' '}
          <span className="font-medium text-foreground">aspirate</span>,{' '}
          <span className="font-medium text-foreground">dispense</span>, or{' '}
          <span className="font-medium text-foreground">mix</span> block works on
          a single well — select the block, then click its well on the map.{' '}
          <span className="font-medium text-foreground">Get Fresh Media</span> and{' '}
          <span className="font-medium text-foreground">Deposit to Waste</span> use
          the reservoirs directly.
        </p>
      </section>
    </div>
  )
}
