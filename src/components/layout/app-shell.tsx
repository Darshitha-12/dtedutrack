"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { BottomTabBar } from "@/components/layout/bottom-tab-bar"
import { LanguageProvider } from "@/lib/language-context"
import { PomodoroProvider } from "@/features/pomodoro/PomodoroProvider"

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const pathname = usePathname()
  // Chat renders full-bleed with its own h-[calc(100dvh-…)] math and manages
  // its own scrolling, so it opts out of the shell padding + bottom tab bar.
  const isChat = pathname === "/chat"

  return (
    <LanguageProvider>
      <PomodoroProvider>
        <div className="min-h-dvh">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className={isChat ? "lg:pl-64" : "lg:pl-64 pb-24 lg:pb-10"}>
            <div
              className={
                isChat
                  ? ""
                  : "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
              }
            >
              <div key={pathname} className={isChat ? "" : "animate-fade-in"}>
                {children}
              </div>
            </div>
          </main>
          <BottomTabBar />
        </div>
      </PomodoroProvider>
    </LanguageProvider>
  )
}

export { AppShell }