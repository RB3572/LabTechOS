import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useIsDesktop } from '@/lib/responsive'

// Module-level cache so a panel keeps its width across remounts (page changes).
const widthCache: Record<string, number> = {}

/**
 * A fixed-width flex child with a draggable edge handle. `side` is the edge that
 * carries the handle: 'right' for a left-docked panel (nav), 'left' for a
 * right-docked panel (config sidebars).
 */
export function ResizablePanel({
  id,
  side,
  initial,
  min = 220,
  max = 560,
  className,
  children,
}: {
  id: string
  side: 'left' | 'right'
  initial: number
  min?: number
  max?: number
  className?: string
  children: ReactNode
}) {
  const [width, setWidth] = useState(() => widthCache[id] ?? initial)
  const isDesktop = useIsDesktop()

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const raw = side === 'right' ? startW + dx : startW - dx
      const w = Math.max(min, Math.min(max, raw))
      widthCache[id] = w
      setWidth(w)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Mobile: full-width, fills the remaining flex space (no fixed width, no handle).
  if (!isDesktop) {
    return <div className={cn('relative min-h-0 w-full flex-1', className)}>{children}</div>
  }

  return (
    <div className={cn('relative h-full shrink-0', className)} style={{ width }}>
      {children}
      <div
        onPointerDown={startDrag}
        onDoubleClick={() => {
          widthCache[id] = initial
          setWidth(initial)
        }}
        title="Drag to resize · double-click to reset"
        className={cn(
          'group absolute inset-y-0 z-40 flex w-2.5 cursor-col-resize touch-none items-center justify-center',
          side === 'right' ? '-right-1.5' : '-left-1.5',
        )}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/50" />
        <span className="relative h-9 w-1 rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  )
}
