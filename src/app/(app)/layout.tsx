import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/layout/app-shell"
import { ReminderPortal } from "@/features/reminders/ReminderPortal"
import { AlarmPortal } from "@/features/alarms/AlarmPortal"
import { ToastProvider } from "@/components/ui/toast"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

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
