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
        "fixed inset-x-0 bottom-0 z-40 block lg:hidden",
        "px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3",
        "pointer-events-none"
      )}
    >
      <div className="gradient-border pointer-events-auto mx-auto flex h-[68px] max-w-md items-center justify-around rounded-[26px] border border-white/[0.09] bg-[hsl(var(--card))]/85 px-2 shadow-2xl backdrop-blur-2xl">
        {BOTTOM_TABS.map((t) => {
          const active = trimmed === t.href || trimmed.startsWith(t.href + "/")
          const Icon = t.icon
          const showBadge = t.href === "/chat" && totalUnread > 0
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-1 flex-col items-center justify-center gap-1"
            >
              <span
                className={cn(
                  "relative grid h-11 w-11 place-items-center rounded-2xl transition-all duration-300 ease-spring",
                  active
                    ? "bg-gradient-aurora text-white shadow-glow"
                    : "bg-white/[0.05] text-muted-foreground group-hover:-translate-y-0.5 group-hover:bg-white/10 group-hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {showBadge && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] animate-scale-in items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-500 px-1 text-[10px] font-extrabold text-white shadow-md ring-2 ring-[hsl(var(--card))]">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold tracking-tight transition-colors duration-200",
                  active ? "text-foreground" : "text-muted-foreground/80"
                )}
              >
                {t.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}