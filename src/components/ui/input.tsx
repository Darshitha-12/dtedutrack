import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-surface-2/60 px-3.5 py-2 text-sm text-foreground shadow-xs",
          "placeholder:text-muted-foreground/70",
          "transition-all duration-200 ease-smooth",
          "hover:border-border-strong",
          "focus-visible:border-primary/60 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/30",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }