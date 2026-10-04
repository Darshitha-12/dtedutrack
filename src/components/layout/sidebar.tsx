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
      {/* Brand — oversized aurora mark */}
      <div className="relative shrink-0 px-5 pb-4 pt-6">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="group flex items-center gap-3"
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-aurora text-xl shadow-glow-lg transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:rotate-6">
            <span className="leading-none">🧬</span>
          </span>
          <span className="min-w-0">
            <span className="text-gradient block font-display text-xl font-extrabold leading-none tracking-tight">
              BioPulse
            </span>
            <span className="mt-1 block text-2xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
              Command Center
            </span>
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="pressable absolute right-4 top-5 rounded-xl p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* User card — aurora gradient card */}
      <div className="px-4 pb-4">
        <div className="gradient-border relative flex items-center gap-3 overflow-hidden rounded-3xl bg-gradient-aurora-soft p-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-aurora text-base font-extrabold text-white shadow-lg">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">
              {user?.name || "Student"}
            </p>
            <p className="truncate text-2xs text-muted-foreground">{user?.email || ""}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section, si) => (
          <React.Fragment key={si}>
            {section.separator && <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />}
            {section.title && (
              <p className="px-3 pb-2 text-2xs font-extrabold uppercase tracking-[0.2em] text-violet/80">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
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
                      "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold",
                      "transition-all duration-300 ease-premium",
                      isActive
                        ? "text-white shadow-glow"
                        : "text-muted-foreground hover:translate-x-1 hover:bg-white/[0.06] hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <span className="absolute inset-0 -z-10 rounded-2xl bg-gradient-aurora" />
                    )}
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-all duration-300 ease-spring",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-white/[0.05] text-muted-foreground group-hover:scale-110 group-hover:bg-white/10 group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-[17px] w-[17px]" />
                    </span>
                    <span className="flex-1 truncate">{t(item.labelKey)}</span>
                    {unread > 0 && (
                      <span className="min-w-[22px] rounded-full bg-gradient-aurora px-2 py-0.5 text-center text-[10px] font-extrabold text-white shadow-md">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </React.Fragment>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-white/[0.07] p-3">
        <button
          onClick={() => setLocale(locale === "si" ? "en" : "si")}
          className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all duration-300 hover:bg-white/[0.06] hover:text-foreground"
        >
          <Globe className="h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:rotate-180" />
          <span className="flex-1 text-left">{locale === "si" ? "EN" : "සිංහල"}</span>
          <span className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-2xs font-extrabold uppercase text-muted-foreground">
            {locale}
          </span>
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all duration-300 hover:bg-destructive/15 hover:text-destructive"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
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
      {/* Desktop rail — floating glass panel */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-white/[0.07] bg-white/[0.025] backdrop-blur-2xl lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />
          <div className="absolute inset-y-0 left-0 w-[300px] animate-slide-in border-r border-white/10 bg-[hsl(var(--popover))] shadow-2xl">
            <SidebarContent pathname={pathname} onClose={onClose} />
          </div>
        </div>
      )}
    </>
  )
}

export { Sidebar, NAV_SECTIONS }