"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  LayoutDashboard,
  Brain,
  BookOpen,
  FileText,
  Target,
  ScrollText,
  Layers,
  Microscope,
  Download,
  AlertTriangle,
  BarChart3,
  Search,
  Clock,
  Bell,
  BellRing,
  Settings,
  User,
  X,
  LogOut,
  Globe,
  Award,
  StickyNote,
  MessagesSquare,
  MessageCircle,
  Wallet,
  Youtube,
  Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useT, useLanguage } from "@/lib/language-context"
import { useChatUnread } from "@/features/chat/lib/unread-store"

interface NavItem {
  label: string
  labelKey: string
  href: string
  icon: React.ElementType
  badge?: string
  /** Short label for the mobile bottom tab bar. */
  tab?: string
}

interface NavSection {
  items: NavItem[]
  separator?: boolean
  /** Shown as a small caption above the group. */
  title?: string
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Study",
    items: [
      { label: "Dashboard", labelKey: "sidebar.dashboard", href: "/dashboard", icon: LayoutDashboard, tab: "Home" },
      { label: "AI Tutor", labelKey: "sidebar.aiTutor", href: "/ai-tutor", icon: Brain, tab: "Tutor" },
      { label: "Syllabus", labelKey: "sidebar.syllabus", href: "/syllabus", icon: BookOpen, tab: "Syllabus" },
      { label: "Question Bank", labelKey: "sidebar.questions", href: "/questions", icon: Target, tab: "Questions" },
      { label: "Notes", labelKey: "sidebar.notes", href: "/notes", icon: FileText, tab: "Notes" },
      { label: "Practice", labelKey: "sidebar.practice", href: "/practice", icon: Target, tab: "Practice" },
      { label: "Past Papers", labelKey: "sidebar.pastPapers", href: "/past-papers", icon: ScrollText, tab: "Papers" },
      { label: "Flashcards", labelKey: "sidebar.flashcards", href: "/flashcards", icon: Layers, tab: "Cards" },
      { label: "Note Pad", labelKey: "sidebar.notePad", href: "/note-pad", icon: StickyNote, tab: "Note Pad" },
      { label: "Exam Marks", labelKey: "sidebar.examMarks", href: "/exam-marks", icon: Award, tab: "Marks" },
      { label: "Class Fees", labelKey: "sidebar.classFees", href: "/fees", icon: Wallet, tab: "Fees" },
      { label: "Diagram Lab", labelKey: "sidebar.diagramLab", href: "/diagrams", icon: Microscope, tab: "Diagrams" },
      { label: "Telegram", labelKey: "sidebar.telegram", href: "/telegram", icon: MessagesSquare, tab: "Telegram" },
      { label: "Messages", labelKey: "sidebar.messages", href: "/chat", icon: MessageCircle, tab: "Chat" },
      { label: "YT", labelKey: "sidebar.yt", href: "/yt", icon: Youtube, tab: "YT" },
      { label: "Download Manager", labelKey: "sidebar.download", href: "/downloads", icon: Download, tab: "Downloads" },
      { label: "Work Log", labelKey: "sidebar.workLog", href: "/work-log", icon: Clock, tab: "Work Log" },
      { label: "Mistake Book", labelKey: "sidebar.mistakeBook", href: "/mistakes", icon: AlertTriangle, tab: "Mistakes" },
      { label: "Analytics", labelKey: "sidebar.analytics", href: "/analytics", icon: BarChart3, tab: "Analytics" },
      { label: "Search", labelKey: "sidebar.search", href: "/search", icon: Search, tab: "Search" },
    ],
  },
  {
    title: "Focus",
    separator: true,
    items: [
      { label: "Pomodoro", labelKey: "sidebar.pomodoro", href: "/focus", icon: Clock, tab: "Focus" },
      { label: "Timer", labelKey: "sidebar.timer", href: "/timer", icon: Timer, tab: "Timer" },
      { label: "Alarms", labelKey: "sidebar.alarms", href: "/alarms", icon: Bell, tab: "Alarms" },
      { label: "Reminders", labelKey: "sidebar.reminders", href: "/reminders", icon: BellRing, tab: "Reminders" },
    ],
  },
  {
    title: "Account",
    separator: true,
    items: [
      { label: "Settings", labelKey: "sidebar.settings", href: "/settings", icon: Settings, tab: "Settings" },
      { label: "Profile", labelKey: "sidebar.profile", href: "/profile", icon: User, tab: "Profile" },
    ],
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const { data: session } = useSession()
  const t = useT()
  const { locale, setLocale } = useLanguage()
  const { totalUnread } = useChatUnread()
  const user = session?.user
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="group flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-lg shadow-md transition-transform duration-300 ease-spring group-hover:scale-105">
            <span className="leading-none">🧬</span>
          </span>
          <span className="text-gradient truncate font-display text-lg font-bold tracking-tight">
            BioPulse
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="pressable shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* User card */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2/50 p-2.5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user?.name || "Student"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email || ""}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="scrollbar-slim flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV_SECTIONS.map((section, si) => (
          <React.Fragment key={si}>
            {section.separator && <div className="my-3 border-t border-border/70" />}
            {section.title && (
              <p className="px-3 pb-1.5 pt-1 text-2xs font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const trimmed = pathname.replace(/\/+$/, "")
              const isActive = trimmed === item.href || trimmed.startsWith(item.href + "/")
              const Icon = item.icon
              const unread = item.href === "/chat" ? totalUnread : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    "transition-all duration-200 ease-premium",
                    isActive
                      ? "bg-primary/12 text-primary shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.25)]"
                      : "text-muted-foreground hover:bg-accent/50 hover:translate-x-0.5 hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-glow" />
                  )}
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-transform duration-200 ease-spring",
                      isActive ? "text-primary" : "text-muted-foreground/80 group-hover:scale-110"
                    )}
                  />
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
                  {unread > 0 && (
                    <span className="min-w-[20px] rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-bold text-primary-foreground shadow-sm">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              )
            })}
          </React.Fragment>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-border p-3">
        <button
          onClick={() => setLocale(locale === "si" ? "en" : "si")}
          className="tap-highlight flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground"
        >
          <Globe className="h-[18px] w-[18px] shrink-0" />
          <span className="flex-1 text-left">{locale === "si" ? "EN" : "සිංහල"}</span>
          <span className="text-2xs font-bold uppercase text-muted-foreground/60">{locale}</span>
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="tap-highlight flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>{t("sidebar.logout")}</span>
        </button>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card/80 backdrop-blur-2xl lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-background/75 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] animate-slide-in border-r border-border bg-card shadow-2xl">
            <SidebarContent pathname={pathname} onClose={onClose} />
          </div>
        </div>
      )}
    </>
  )
}

export { Sidebar, NAV_SECTIONS }