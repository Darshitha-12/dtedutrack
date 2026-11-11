import { AppShell } from "./app-shell"
import { ReminderPortal } from "@/features/reminders/ReminderPortal"
import { AlarmPortal } from "@/features/alarms/AlarmPortal"
import { ToastProvider } from "@/components/ui/toast"
import { MediaCommandBridge } from "@/components/app/media-command-bridge"
import { AccountSyncPortal } from "@/components/account-sync-portal"

// The full app chrome (sidebar, top bar, portals, toasts). Shared by the (app) route
// group and the offline root page so a cold-start dashboard load at "/" gets the same
// navigation shell as every in-app route.
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <MediaCommandBridge />
      <AccountSyncPortal />
      <AppShell>{children}</AppShell>
      <ReminderPortal />
      <AlarmPortal />
    </ToastProvider>
  )
}
