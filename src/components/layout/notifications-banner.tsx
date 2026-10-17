"use client"

import * as React from "react"
import { BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isNativeApp, nativeBridge } from "@/lib/native-shell"

/**
 * Shown only inside the Android shell when the OS will not display notifications. On Android 13+
 * a dismissed runtime grant hides every alert: the alarm still rings (sound + vibration) while the
 * shade stays empty, which reads as "no notification". One tap takes the user to the system
 * settings so they can switch BioPulse back on.
 */
function NotificationsBanner() {
  const [hidden, setHidden] = React.useState(false)
  const bridge = nativeBridge()
  const visible =
    !hidden &&
    isNativeApp() &&
    bridge !== null &&
    typeof bridge.notificationsEnabled === "function" &&
    bridge.notificationsEnabled() === false

  if (!visible) return null

  const openSettings = () => bridge?.openNotificationSettings?.()

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-amber-300">
            <BellOff className="h-4 w-4" />
            <span>
              Notifications are off — alarms will ring but won&apos;t show. Turn them on to see each
              alarm.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openSettings}>
              Open settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Dismiss"
              onClick={() => setHidden(true)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { NotificationsBanner }