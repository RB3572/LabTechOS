import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  Clock,
  Droplet,
  Repeat,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { BlockType } from '@/types'

/** The drag item type shared by the library and canvas drop targets. */
export const BLOCK_DND_TYPE = 'WORKFLOW_BLOCK'

/**
 * Two kinds of drags share one DnD type:
 *  - `new`  — a fresh block dragged from the library
 *  - `move` — an already-placed block being reordered or removed
 */
export type BlockDragItem =
  | { kind: 'new'; blockType: BlockType }
  | { kind: 'move'; id: string }

export const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  aspirate: ArrowUpFromLine,
  dispense: ArrowDownToLine,
  'get-media': Droplet,
  'to-waste': Trash2,
  mix: ArrowUpDown,
  wait: Clock,
  loop: Repeat,
}

export interface AccentStyle {
  icon: string
  bar: string
  chip: string
}

/** Color treatments keyed by the block definition's `accent`. */
export const ACCENTS: Record<string, AccentStyle> = {
  rose: {
    icon: 'bg-rose-50 text-rose-600 ring-rose-600/15',
    bar: 'bg-rose-400',
    chip: 'hover:border-rose-300 hover:bg-rose-50/40',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-600 ring-emerald-600/15',
    bar: 'bg-emerald-400',
    chip: 'hover:border-emerald-300 hover:bg-emerald-50/40',
  },
  sky: {
    icon: 'bg-sky-50 text-sky-600 ring-sky-600/15',
    bar: 'bg-sky-400',
    chip: 'hover:border-sky-300 hover:bg-sky-50/40',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600 ring-slate-600/15',
    bar: 'bg-slate-400',
    chip: 'hover:border-slate-300 hover:bg-slate-50/60',
  },
  indigo: {
    icon: 'bg-indigo-50 text-indigo-600 ring-indigo-600/15',
    bar: 'bg-indigo-400',
    chip: 'hover:border-indigo-300 hover:bg-indigo-50/40',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-amber-600/15',
    bar: 'bg-amber-400',
    chip: 'hover:border-amber-300 hover:bg-amber-50/40',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 ring-violet-600/15',
    bar: 'bg-violet-400',
    chip: 'hover:border-violet-300 hover:bg-violet-50/40',
  },
}
