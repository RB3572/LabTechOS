import {
  Code2,
  Cpu,
  Crosshair,
  LayoutDashboard,
  LayoutPanelLeft,
  LifeBuoy,
  type LucideIcon,
  Microscope,
  Pipette,
  PlayCircle,
  Terminal,
} from 'lucide-react'
import type { Page } from '@/types'

export interface NavItemDef {
  key: Page
  label: string
  icon: LucideIcon
  /** Implemented screens route to real pages; the rest show a placeholder. */
  implemented: boolean
}

export const NAV_PRIMARY: NavItemDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, implemented: true },
  { key: 'plate-setup', label: 'Plate Routine', icon: Microscope, implemented: true },
  { key: 'calibration', label: 'Calibrated Deck Setup', icon: Crosshair, implemented: true },
  { key: 'deck-setup', label: 'Manual Deck Setup', icon: LayoutPanelLeft, implemented: true },
  { key: 'pipette-calibration', label: 'Pipette Calibration', icon: Pipette, implemented: true },
  { key: 'g-code', label: 'G-Code', icon: Code2, implemented: true },
  { key: 'simulation', label: 'Simulation', icon: PlayCircle, implemented: true },
  { key: 'machine-control', label: 'Machine Control', icon: Cpu, implemented: true },
]

export const NAV_FOOTER: NavItemDef[] = [
  { key: 'support', label: 'Support', icon: LifeBuoy, implemented: false },
  { key: 'logs', label: 'Logs', icon: Terminal, implemented: false },
]

/** Title shown in the top bar for each screen. */
export const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  'plate-setup': 'Plate Routine',
  'deck-setup': 'Manual Deck Setup',
  simulation: 'Simulation',
  'g-code': 'G-Code',
  calibration: 'Calibrated Deck Setup',
  'pipette-calibration': 'Pipette Calibration',
  'machine-control': 'Machine Control',
  support: 'Support',
  logs: 'Logs',
}
