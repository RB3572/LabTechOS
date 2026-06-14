import { useStore } from '@/store/useStore'
import { PLATES } from '@/lib/plate'
import { Card } from '@/components/ui/card'
import { PlateControls } from './PlateControls'
import { WellSelector } from './WellSelector'
import { WorkflowBuilder } from '@/components/workflow/WorkflowBuilder'

export function PlateSetupPage() {
  const plateType = useStore((s) => s.plateType)
  const plate = PLATES[plateType]

  // Layout switches via a CSS container query (see .pr-* in index.css): three
  // columns side by side while there's room, otherwise stacked + scrolling
  // vertically. The query reads the real available width, so the resizable nav
  // is accounted for.
  return (
    <div className="pr-container">
      <div className="pr-grid scrollbar-thin">
        <Card className="pr-col-controls p-4">
          <PlateControls plate={plate} />
        </Card>
        <Card className="pr-col-center p-0">
          <WellSelector plate={plate} />
        </Card>
        <Card className="pr-col-workflow p-0">
          <WorkflowBuilder />
        </Card>
      </div>
    </div>
  )
}
