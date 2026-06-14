import { Suspense, lazy } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { CircleDashed, Loader2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { PlateSetupPage } from '@/components/plate/PlateSetupPage'
import { GCodePage } from '@/components/gcode/GCodePage'
import { MachineControlPage } from '@/components/machine/MachineControlPage'
import { PlaceholderPage } from '@/components/PlaceholderPage'
import { NAV_FOOTER, NAV_PRIMARY, PAGE_TITLES } from '@/lib/nav'

// The 3D screens pull in Three.js — load them only when opened.
const DeckSetupPage = lazy(() =>
  import('@/components/deck/DeckSetupPage').then((m) => ({
    default: m.DeckSetupPage,
  })),
)

const CalibrationPage = lazy(() =>
  import('@/components/calibration/CalibrationPage').then((m) => ({
    default: m.CalibrationPage,
  })),
)

const SimulationPage = lazy(() =>
  import('@/components/simulation/SimulationPage').then((m) => ({
    default: m.SimulationPage,
  })),
)

const PipetteCalibrationPage = lazy(() =>
  import('@/components/pipette/PipetteCalibrationPage').then((m) => ({
    default: m.PipetteCalibrationPage,
  })),
)

const NAV_LOOKUP = [...NAV_PRIMARY, ...NAV_FOOTER]

function WorkspaceLoader() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Loading 3D workspace…
    </div>
  )
}

export default function App() {
  const page = useStore((s) => s.page)

  let content
  if (page === 'dashboard') content = <DashboardPage />
  else if (page === 'plate-setup') content = <PlateSetupPage />
  else if (page === 'g-code') content = <GCodePage />
  else if (page === 'machine-control') content = <MachineControlPage />
  else if (page === 'deck-setup')
    content = (
      <Suspense fallback={<WorkspaceLoader />}>
        <DeckSetupPage />
      </Suspense>
    )
  else if (page === 'calibration')
    content = (
      <Suspense fallback={<WorkspaceLoader />}>
        <CalibrationPage />
      </Suspense>
    )
  else if (page === 'pipette-calibration')
    content = (
      <Suspense fallback={<WorkspaceLoader />}>
        <PipetteCalibrationPage />
      </Suspense>
    )
  else if (page === 'simulation')
    content = (
      <Suspense fallback={<WorkspaceLoader />}>
        <SimulationPage />
      </Suspense>
    )
  else {
    const item = NAV_LOOKUP.find((n) => n.key === page)
    content = (
      <PlaceholderPage title={PAGE_TITLES[page]} icon={item?.icon ?? CircleDashed} />
    )
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <AppShell>{content}</AppShell>
    </DndProvider>
  )
}
