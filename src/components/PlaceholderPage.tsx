import type { LucideIcon } from 'lucide-react'

export function PlaceholderPage({
  title,
  icon: Icon,
}: {
  title: string
  icon: LucideIcon
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <Icon className="size-7" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This module isn't part of the current prototype build. The Dashboard,
          Plate Routine, and Deck Setup screens are fully interactive.
        </p>
      </div>
    </div>
  )
}
