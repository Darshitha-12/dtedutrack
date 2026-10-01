"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Menu, Bell, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/language-context"
import { useChatUnread } from "@/features/chat/lib/unread-store"

interface TopbarProps {
  onMenuClick: () => void
  className?: string
}

function Topbar({ onMenuClick, className }: TopbarProps) {
  const { data: session } = useSession()
  const { locale, setLocale } = useLanguage()
  const { totalUnread } = useChatUnread()
  const router = useRouter()
  const user = session?.user
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/75 px-3 backdrop-blur-2xl lg:hidden",
        className
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="pressable rounded-xl p-2 text-foreground transition-colors hover:bg-accent"
      >
        <Menu className="h-[22px] w-[22px]" />
      </button>

      <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary text-base shadow-md">
          🧬
        </span>
        <span className="text-gradient hidden xs:inline">BioPulse</span>
      </span>

      <div className="flex-1" />

      <button
        onClick={() => setLocale(locale === "si" ? "en" : "si")}
        aria-label="Toggle language"
        className="pressable flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Globe className="h-4 w-4" />
        <span>{locale === "si" ? "EN" : "සිංහල"}</span>
      </button>

      <button
        onClick={() => router.push("/chat")}
        aria-label="Notifications"
        className="pressable relative rounded-xl p-2 text-foreground transition-colors hover:bg-accent"
      >
        <Bell className="h-[22px] w-[22px]" />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] animate-scale-in items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-glow ring-2 ring-background">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      <button
        onClick={() => router.push("/profile")}
        aria-label="Profile"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground shadow-md transition-transform duration-200 ease-spring active:scale-95"
      >
        {initial}
      </button>
    </header>
  )
}

export { Topbar }