"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

function Toggle({ checked, onCheckedChange, label, disabled = false, className }: ToggleProps) {
  const id = React.useId()

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-3",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <div
        className={cn(
          "relative h-6 w-11 rounded-full border border-border-strong/60 bg-muted",
          "transition-all duration-300 ease-premium",
          "peer-checked:border-primary/40 peer-checked:bg-primary/85 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-checked:shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
        )}
      >
        <div
          className={cn(
            "absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-foreground/90 shadow-sm",
            "transition-transform duration-300 ease-spring",
            "peer-checked:translate-x-[20px] peer-checked:bg-white"
          )}
        />
      </div>
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
    </label>
  )
}

export { Toggle }