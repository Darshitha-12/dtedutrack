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
          "flex h-12 w-full rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-sm font-medium text-foreground shadow-xs backdrop-blur-sm",
          "placeholder:text-muted-foreground/70",
          "transition-all duration-300 ease-smooth",
          "hover:border-violet/35 hover:bg-white/[0.06]",
          "focus-visible:border-violet/60 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
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