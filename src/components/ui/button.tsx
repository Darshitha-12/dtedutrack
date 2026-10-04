import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base — aurora motion: 300ms spring ease, subtle lift, press scale.
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold select-none " +
    "transition-all duration-300 ease-premium will-change-transform " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-aurora bg-[length:200%_200%] bg-[position:0%_50%] text-white shadow-glow " +
          "hover:shadow-glow-lg hover:bg-[position:100%_50%] hover:-translate-y-0.5 active:translate-y-0",
        destructive:
          "bg-destructive text-destructive-foreground shadow-md hover:brightness-110 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
        success:
          "bg-success text-success-foreground shadow-md hover:brightness-110 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
        outline:
          "border border-white/[0.1] bg-white/[0.04] text-foreground shadow-xs backdrop-blur-sm " +
          "hover:border-violet/45 hover:bg-white/[0.09] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0",
        secondary:
          "bg-cyan/15 text-cyan border border-cyan/30 hover:bg-cyan/25 hover:border-cyan/45 hover:-translate-y-0.5",
        ghost:
          "text-muted-foreground hover:bg-white/[0.07] hover:text-foreground active:bg-white/[0.12]",
        subtle:
          "bg-white/[0.05] text-foreground hover:bg-white/[0.1] hover:-translate-y-0.5",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80 p-0 h-auto",
      },
      size: {
        default: "h-11 rounded-2xl px-5 py-2 text-sm",
        sm: "h-9 rounded-xl px-4 text-[13px]",
        xs: "h-8 rounded-lg px-3 text-xs",
        lg: "h-[3.25rem] rounded-2xl px-8 text-[15px]",
        xl: "h-14 rounded-3xl px-10 text-base",
        icon: "h-11 w-11 rounded-2xl",
        "icon-sm": "h-9 w-9 rounded-xl",
        "icon-lg": "h-[3.25rem] w-[3.25rem] rounded-2xl",
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