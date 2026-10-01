import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base — premium motion: 200ms spring-ish ease, subtle lift, press scale.
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
    "transition-all duration-200 ease-premium will-change-transform " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-primary bg-[length:200%_200%] bg-[position:0%_50%] text-primary-foreground shadow-md " +
          "hover:shadow-lg hover:bg-[position:100%_50%] hover:-translate-y-px active:translate-y-0",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:brightness-110 hover:shadow-lg hover:-translate-y-px active:translate-y-0",
        success:
          "bg-success text-success-foreground shadow-md hover:brightness-110 hover:shadow-lg hover:-translate-y-px active:translate-y-0",
        outline:
          "border border-border-strong bg-elevated/60 text-foreground shadow-xs backdrop-blur-sm " +
          "hover:border-primary/40 hover:bg-accent/60 hover:-translate-y-px hover:shadow-md active:translate-y-0",
        secondary:
          "bg-secondary/15 text-secondary border border-secondary/25 hover:bg-secondary/25 hover:border-secondary/40 hover:-translate-y-px",
        ghost:
          "text-muted-foreground hover:bg-accent/60 hover:text-foreground active:bg-accent/80",
        subtle:
          "bg-muted/70 text-foreground hover:bg-muted hover:-translate-y-px",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80 p-0 h-auto",
      },
      size: {
        default: "h-10 rounded-lg px-4 py-2 text-sm",
        sm: "h-9 rounded-md px-3.5 text-[13px]",
        xs: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-[15px]",
        xl: "h-14 rounded-xl px-10 text-base",
        icon: "h-10 w-10 rounded-lg",
        "icon-sm": "h-8 w-8 rounded-md",
        "icon-lg": "h-12 w-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renders a glossy top highlight — the "premium" cue on primary CTAs. */
  glossy?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, glossy, children, ...props }, ref) => {
    const showGlossy = glossy ?? (variant === "default" && (size === "lg" || size === "xl"))
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), showGlossy && "overflow-hidden")}
        ref={ref}
        {...props}
      >
        {showGlossy && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
          />
        )}
        <span className="relative inline-flex items-center justify-center gap-2">{children}</span>
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }