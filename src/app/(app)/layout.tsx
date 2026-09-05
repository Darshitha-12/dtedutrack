import { AppShell } from "@/components/layout/app-shell"
import { ReminderPortal } from "@/features/reminders/ReminderPortal"
import { AlarmPortal } from "@/features/alarms/AlarmPortal"
import { ToastProvider } from "@/components/ui/toast"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToastProvider>
        <AppShell>{children}</AppShell>
        <ReminderPortal />
        <AlarmPortal />
      </ToastProvider>
    </>
  )
}
