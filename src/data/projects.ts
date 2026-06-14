import type { Project } from '@/types'

/** Mock recent-projects data shown on the Dashboard. */
export const RECENT_PROJECTS: Project[] = [
  {
    id: 'proj-hek293',
    name: 'HEK293 Maintenance',
    dateModified: 'Today',
    plateType: '24-Well Plate',
    plate: '24-well',
    status: 'Draft',
  },
  {
    id: 'proj-drug-screen',
    name: 'Drug Screening Run',
    dateModified: 'Yesterday',
    plateType: '96-Well Plate',
    plate: '96-well',
    status: 'Validated',
  },
  {
    id: 'proj-stem-cell',
    name: 'Stem Cell Expansion',
    dateModified: '2 Days Ago',
    plateType: '24-Well Plate',
    plate: '24-well',
    status: 'Draft',
  },
]
