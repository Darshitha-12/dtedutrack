import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** Small pill rendered above the title — e.g. "Live", "Beta". */
  eyebrow?: React.ReactNode
}

function PageHeader({ title, description, action, className, eyebrow }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex animate-fade-up flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export { PageHeader }