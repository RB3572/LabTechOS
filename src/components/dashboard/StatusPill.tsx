import type { ProjectStatus } from '@/types'
import { cn } from '@/lib/utils'

const STYLES: Record<ProjectStatus, { wrap: string; dot: string }> = {
  Validated: {
    wrap: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  Draft: {
    wrap: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  Error: {
    wrap: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    dot: 'bg-rose-500',
  },
}

export function StatusPill({ status }: { status: ProjectStatus }) {
  const s = STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        s.wrap,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.dot)} />
      {status}
    </span>
  )
}
