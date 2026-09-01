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
        "inline-flex items-center gap-3 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
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
      <div className="relative h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors">
        <div className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-foreground shadow-sm transition-transform peer-checked:translate-x-full" />
      </div>
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  )
}

export { Toggle }
