import type { ReactNode } from 'react'
import { ResizablePanel } from '@/components/ui/ResizablePanel'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-foreground">
      <ResizablePanel id="nav" side="right" initial={240} min={196} max={380}>
        <Sidebar />
      </ResizablePanel>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
