"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { BottomTabBar } from "@/components/layout/bottom-tab-bar"
import { LanguageProvider } from "@/lib/language-context"
import { PomodoroProvider } from "@/features/pomodoro/PomodoroProvider"
import { NotificationsBanner } from "@/components/layout/notifications-banner"
import { checkForOtaUpdate } from "@/lib/ota-updater"

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const pathname = usePathname()
  // Chat renders full-bleed with its own h-[calc(100dvh-…)] math and manages
  // its own scrolling, so it opts out of the shell padding + bottom tab bar.
  const isChat = pathname === "/chat"

  React.useEffect(() => {
    // In the offline APK this silently installs newer web bundles when online; it is a no-op
    // everywhere else (no native bridge). Re-check when the network comes back mid-session.
    void checkForOtaUpdate()
    const onOnline = () => void checkForOtaUpdate()
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [])

  return (
    <LanguageProvider>
      <PomodoroProvider>
        <div className="min-h-dvh">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className={isChat ? "lg:pl-[280px]" : "lg:pl-[280px] pb-32 lg:pb-12"}>
            <NotificationsBanner />
            <div
              className={
                isChat
                  ? ""
                  : "mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8"
              }
            >
              <div key={pathname} className={isChat ? "" : "animate-fade-in"}>
                {children}
              </div>
            </div>
          </main>
          {/* Chat is full-bleed: its composer is pinned to the bottom of the viewport, so the
              floating tab bar would sit on top of it and swallow every tap meant for the input.
              Every other route is padded by the shell (pb-32) to leave room for the bar. */}
          {!isChat && <BottomTabBar />}
        </div>
      </PomodoroProvider>
    </LanguageProvider>
  )
}

export { AppShell }