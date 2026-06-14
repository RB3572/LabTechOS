import { useDrag } from 'react-dnd'
import type { BlockDefinition, BlockType } from '@/types'
import { BLOCK_DEFINITIONS, BLOCK_ORDER } from '@/lib/workflow'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import { ACCENTS, BLOCK_DND_TYPE, BLOCK_ICONS } from './blockStyles'

function LibraryBlock({ def }: { def: BlockDefinition }) {
  const addStep = useStore((s) => s.addStep)
  const Icon = BLOCK_ICONS[def.type]
  const accent = ACCENTS[def.accent]

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: BLOCK_DND_TYPE,
      item: { kind: 'new', blockType: def.type } as const,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [def.type],
  )

  return (
    <button
      ref={(node) => {
        drag(node)
      }}
      onClick={() => addStep(def.type)}
      title={`${def.description} — drag onto the canvas or click to add`}
      className={cn(
        'group flex cursor-grab items-center gap-2 rounded-lg border border-border bg-white p-2 text-left shadow-sm transition-all hover:shadow active:cursor-grabbing',
        accent.chip,
        isDragging && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
          accent.icon,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
        {def.label}
      </span>
    </button>
  )
}

export function BlockLibrary() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {BLOCK_ORDER.map((type: BlockType) => (
        <LibraryBlock key={type} def={BLOCK_DEFINITIONS[type]} />
      ))}
    </div>
  )
}
