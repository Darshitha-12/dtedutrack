"use client"

import * as React from "react"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { LanguageProvider } from "@/lib/language-context"
import { PomodoroProvider } from "@/features/pomodoro/PomodoroProvider"

function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <LanguageProvider>
      <PomodoroProvider>
        <div className="min-h-screen">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="lg:pl-64">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </PomodoroProvider>
    </LanguageProvider>
  )
}

export { AppShell }
