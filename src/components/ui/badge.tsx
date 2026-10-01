import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide " +
    "transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/15 text-primary",
        secondary: "border-secondary/25 bg-secondary/15 text-secondary",
        success: "border-success/25 bg-success/15 text-success",
        warning: "border-warning/25 bg-warning/15 text-warning",
        destructive: "border-destructive/25 bg-destructive/15 text-destructive",
        muted: "border-border bg-muted text-muted-foreground",
        outline: "border-border-strong text-foreground",
        solid: "border-transparent bg-gradient-primary text-primary-foreground shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

// Semantic tokens so these read correctly in BOTH themes.
const GRADE_STYLES: Record<string, string> = {
  A: "border-success/25 bg-success/15 text-success",
  B: "border-secondary/25 bg-secondary/15 text-secondary",
  C: "border-warning/25 bg-warning/15 text-warning",
  S: "border-destructive/25 bg-destructive/15 text-destructive",
  W: "border-border bg-muted text-muted-foreground",
}

interface GradeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
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