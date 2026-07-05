import { useState, type ReactNode } from 'react'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { useIsDesktop } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop()
  // Open by default on desktop, closed on mobile. Toggled by the header menu.
  const [navOpen, setNavOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 768,
  )

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-foreground">
      {/* Desktop: in-flow, resizable, collapsible sidebar */}
      {isDesktop && navOpen && (
        <ResizablePanel id="nav" side="right" initial={240} min={196} max={380}>
          <Sidebar />
        </ResizablePanel>
      )}

      {/* Mobile: off-canvas drawer + backdrop */}
      {!isDesktop && (
        <div className={cn('fixed inset-0 z-50', !navOpen && 'pointer-events-none')}>
          <div
            className={cn(
              'absolute inset-0 bg-slate-900/40 transition-opacity duration-200',
              navOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setNavOpen(false)}
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-64 max-w-[82%] shadow-xl transition-transform duration-200 ease-out',
              navOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setNavOpen((o) => !o)} />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
