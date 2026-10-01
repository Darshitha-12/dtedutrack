"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Brain,
  MessageCircle,
  Timer,
  Settings,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useChatUnread } from "@/features/chat/lib/unread-store"

const BOTTOM_TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ai-tutor", label: "Tutor", icon: Brain },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/focus", label: "Focus", icon: Timer },
]

export function BottomTabBar() {
  const pathname = usePathname()
  const { totalUnread } = useChatUnread()

  const trimmed = pathname.replace(/\/+$/, "")

  return (
    <nav
      aria-label="Bottom navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 block border-t border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl",
        "lg:hidden",
        "supports-[backdrop-filter]:bg-card/85",
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div className="grid h-16 grid-cols-5 items-center px-2">
        {BOTTOM_TABS.map((t) => {
          const active = trimmed === t.href || trimmed.startsWith(t.href + "/")
          const Icon = t.icon
          const showBadge = t.href === "/chat" && totalUnread > 0
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-col items-center justify-center gap-0.5 text-center"
            >
              <span
                className={cn(
                  "relative flex items-center justify-center rounded-xl px-3 py-1.5 transition-all duration-200 ease-premium",
                  active ? "bg-primary/12" : "hover:bg-accent/60"
                )}
              >
                <Icon
                  className={cn(
                    "h-[20px] w-[20px] shrink-0 transition-transform duration-200 ease-spring",
                    active ? "scale-110 text-primary" : "text-muted-foreground group-hover:scale-110"
                  )}
                />
                {showBadge && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] animate-scale-in items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground shadow-glow ring-1 ring-background">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-2xs font-medium tracking-tight transition-colors duration-150",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {t.label}
              </span>
              {active && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gradient-primary shadow-glow" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}