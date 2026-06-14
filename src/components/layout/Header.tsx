import { useStore } from '@/store/useStore'
import { PAGE_TITLES } from '@/lib/nav'

export function Header() {
  const page = useStore((s) => s.page)

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-white px-6">
      <h1 className="text-base font-semibold tracking-tight text-foreground">
        {PAGE_TITLES[page]}
      </h1>

      {/* Machine connection status */}
      <div className="ml-auto flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
        <span className="relative flex size-2 items-center justify-center">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/70" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Connected
        </span>
      </div>
    </header>
  )
}
