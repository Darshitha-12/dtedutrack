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
        "sticky top-0 z-30 flex h-[70px] items-center gap-3 border-b border-white/[0.07] bg-white/[0.03] px-4 backdrop-blur-2xl lg:hidden",
        className
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-foreground transition-all duration-300 hover:bg-gradient-aurora hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>

      <span className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-aurora text-lg shadow-glow">
          🧬
        </span>
        <span className="hidden flex-col xs:flex">
          <span className="text-gradient font-display text-base font-extrabold leading-none tracking-tight">
            BioPulse
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
            Command Center
          </span>
        </span>
      </span>

      <div className="flex-1" />

      <button
        onClick={() => setLocale(locale === "si" ? "en" : "si")}
        aria-label="Toggle language"
        className="pressable flex items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-bold text-muted-foreground transition-all duration-300 hover:border-violet/40 hover:text-foreground"
      >
        <Globe className="h-4 w-4" />
        <span>{locale === "si" ? "EN" : "සිංහල"}</span>
      </button>

      <button
        onClick={() => router.push("/chat")}
        aria-label="Notifications"
        className="pressable relative grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-foreground transition-all duration-300 hover:border-fuchsia/40"
      >
        <Bell className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] animate-scale-in items-center justify-center rounded-full bg-gradient-aurora px-1 text-[10px] font-extrabold text-white shadow-glow ring-2 ring-[hsl(var(--background))]">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      <button
        onClick={() => router.push("/profile")}
        aria-label="Profile"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-aurora text-sm font-extrabold text-white shadow-glow transition-transform duration-300 ease-spring active:scale-95"
      >
        {initial}
      </button>
    </header>
  )
}

export { Topbar }