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
  CalendarDays,
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useT, useLanguage } from "@/lib/language-context"

interface NavItem {
  label: string
  labelKey: string
  href: string
  icon: React.ElementType
  badge?: string
}

interface NavSection {
  items: NavItem[]
  separator?: boolean
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", labelKey: "sidebar.dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "AI Tutor", labelKey: "sidebar.aiTutor", href: "/ai-tutor", icon: Brain },
      { label: "Syllabus", labelKey: "sidebar.syllabus", href: "/syllabus", icon: BookOpen },
      { label: "Question Bank", labelKey: "sidebar.questions", href: "/questions", icon: Target },
      { label: "Notes", labelKey: "sidebar.notes", href: "/notes", icon: FileText },
      { label: "Practice", labelKey: "sidebar.practice", href: "/practice", icon: Target },
      { label: "Past Papers", labelKey: "sidebar.pastPapers", href: "/past-papers", icon: ScrollText },
      { label: "Flashcards", labelKey: "sidebar.flashcards", href: "/flashcards", icon: Layers },
      { label: "Note Pad", labelKey: "sidebar.notePad", href: "/note-pad", icon: StickyNote },
      { label: "Exam Marks", labelKey: "sidebar.examMarks", href: "/exam-marks", icon: Award },
      { label: "Diagram Lab", labelKey: "sidebar.diagramLab", href: "/diagrams", icon: Microscope },
      { label: "Telegram", labelKey: "sidebar.telegram", href: "/telegram", icon: MessagesSquare },
      { label: "Messages", labelKey: "sidebar.messages", href: "/chat", icon: MessageCircle },
      { label: "Study Planner", labelKey: "sidebar.studyPlanner", href: "/planner", icon: CalendarDays },
      { label: "Mistake Book", labelKey: "sidebar.mistakeBook", href: "/mistakes", icon: AlertTriangle },
      { label: "Analytics", labelKey: "sidebar.analytics", href: "/analytics", icon: BarChart3 },
      { label: "Search", labelKey: "sidebar.search", href: "/search", icon: Search },
    ],
  },
  {
    separator: true,
    items: [
      { label: "Pomodoro", labelKey: "sidebar.pomodoro", href: "/focus", icon: Clock },
      { label: "Alarms", labelKey: "sidebar.alarms", href: "/alarms", icon: Bell },
      { label: "Reminders", labelKey: "sidebar.reminders", href: "/reminders", icon: BellRing },
    ],
  },
  {
    separator: true,
    items: [
      { label: "Settings", labelKey: "sidebar.settings", href: "/settings", icon: Settings },
      { label: "Profile", labelKey: "sidebar.profile", href: "/profile", icon: User },
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
  const user = session?.user
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "U"

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg flex-1 min-w-0">
          <span>🧬</span>
          <span className="text-gradient truncate">BioPulse</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent shrink-0 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || "Student"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {NAV_SECTIONS.map((section, si) => (
          <React.Fragment key={si}>
            {section.separator && <div className="my-2 border-t border-border" />}
            {section.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/")
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
                  {item.badge && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={() => setLocale(locale === "si" ? "en" : "si")}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{locale === "si" ? "EN" : "සිංහල"}</span>
          <span className="text-[10px] text-muted-foreground uppercase">{locale}</span>
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
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
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-border bg-card z-30">
        <SidebarContent pathname={pathname} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
          <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border animate-slide-in z-50">
            <SidebarContent pathname={pathname} onClose={onClose} />
          </div>
        </div>
      )}
    </>
  )
}

export { Sidebar }
