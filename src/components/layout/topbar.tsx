"use client"

import { useSession } from "next-auth/react"
import { Menu, Bell, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/language-context"

interface TopbarProps {
  onMenuClick: () => void
  className?: string
}

function Topbar({ onMenuClick, className }: TopbarProps) {
  const { data: session } = useSession()
  const { locale, setLocale } = useLanguage()
  const user = session?.user
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:hidden",
        className
      )}
    >
      <button
        onClick={onMenuClick}
        className="p-1.5 rounded-md hover:bg-accent transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="font-bold text-lg text-gradient">🧬 BioPulse</span>
      <div className="flex-1" />
      <button
        onClick={() => setLocale(locale === "si" ? "en" : "si")}
        className="flex items-center gap-1 p-1.5 rounded-md hover:bg-accent transition-colors text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-label="Toggle language"
      >
        <Globe className="h-4 w-4" />
        <span>{locale === "si" ? "EN" : "සිංහල"}</span>
      </button>
      <button className="relative p-1.5 rounded-md hover:bg-accent transition-colors" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
      </button>
      <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
        {initial}
      </div>
    </header>
  )
}

export { Topbar }
