import { AppShell } from "@/components/layout/app-shell"
import { ReminderPortal } from "@/features/reminders/ReminderPortal"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <ReminderPortal />
    </>
  )
}
