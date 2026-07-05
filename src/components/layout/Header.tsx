import { Menu } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { PAGE_TITLES } from '@/lib/nav'

export function Header({ onMenu }: { onMenu?: () => void }) {
  const page = useStore((s) => s.page)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-3 sm:px-6">
      <button
        onClick={onMenu}
        aria-label="Toggle navigation"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
        {PAGE_TITLES[page]}
      </h1>

      {/* Machine connection status */}
      <div className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 sm:px-3">
        <span className="relative flex size-2 items-center justify-center">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/70" />
        </span>
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-emerald-700 sm:inline">
          Connected
        </span>
      </div>
    </header>
  )
}
