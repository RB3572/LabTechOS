import { FlaskConical } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { NAV_FOOTER, NAV_PRIMARY, type NavItemDef } from '@/lib/nav'
import { cn } from '@/lib/utils'

function NavButton({ item, active }: { item: NavItemDef; active: boolean }) {
  const setPage = useStore((s) => s.setPage)
  const Icon = item.icon
  return (
    <button
      onClick={() => setPage(item.key)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-[18px] shrink-0',
          active
            ? 'text-primary'
            : 'text-muted-foreground/80 group-hover:text-foreground',
        )}
      />
      <span>{item.label}</span>
    </button>
  )
}

export function Sidebar() {
  const page = useStore((s) => s.page)

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-[18px]">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <FlaskConical className="size-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            CellSlicer
          </div>
          <div className="text-xs text-muted-foreground">CS-4000 v2.4.0</div>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_PRIMARY.map((item) => (
          <NavButton key={item.key} item={item} active={item.key === page} />
        ))}
      </nav>

      {/* Footer navigation */}
      <div className="space-y-1 border-t border-border px-3 py-3">
        {NAV_FOOTER.map((item) => (
          <NavButton key={item.key} item={item} active={item.key === page} />
        ))}
      </div>
    </aside>
  )
}
