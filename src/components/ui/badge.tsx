import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

const GRADE_STYLES: Record<string, string> = {
  A: "border-transparent bg-emerald-500/20 text-emerald-400",
  B: "border-transparent bg-cyan-500/20 text-cyan-400",
  C: "border-transparent bg-amber-500/20 text-amber-400",
  S: "border-transparent bg-red-500/20 text-red-400",
  W: "border-transparent bg-zinc-500/20 text-zinc-400",
}

interface GradeBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  grade: "A" | "B" | "C" | "S" | "W"
}

function GradeBadge({ grade, className, ...props }: GradeBadgeProps) {
  return (
    <Badge className={cn(GRADE_STYLES[grade], className)} {...props}>
      {grade}
    </Badge>
  )
}

export { Badge, badgeVariants, GradeBadge }
