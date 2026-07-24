import { useState } from 'react'
import { ArrowRight, FilePlus2, FolderOpen, type LucideIcon, TriangleAlert } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { parseCellFile, pickCellFile } from '@/lib/cellfile'
import { Card } from '@/components/ui/card'

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="group text-left">
      <Card className="flex items-start gap-4 p-5 transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-lift">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
            <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </Card>
    </button>
  )
}

export function DashboardPage() {
  const startNewProject = useStore((s) => s.startNewProject)
  const loadConfig = useStore((s) => s.loadConfig)
  const [error, setError] = useState<string | null>(null)

  const openCell = async () => {
    setError(null)
    const text = await pickCellFile()
    if (!text) return
    try {
      loadConfig(parseCellFile(text))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl px-8 py-9">
        {/* Heading */}
        <header className="mb-7">
          <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
            LabTechOS Workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage laboratory automation protocols.
          </p>
        </header>

        {/* Action cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActionCard
            icon={FilePlus2}
            title="New Project"
            description="Create a new automation protocol."
            onClick={startNewProject}
          />
          <ActionCard
            icon={FolderOpen}
            title="Open Existing"
            description="Load a saved .cell configuration file."
            onClick={openCell}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
