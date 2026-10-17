import { redirect } from "next/navigation"
import DashboardPage from "./(app)/dashboard/page"
import { AppFrame } from "@/components/layout/app-frame"

export default function Home() {
  // Offline APK: the root IS the dashboard, so a cold start opens straight into the
  // app without a server round-trip (redirect() has nowhere to go without a server).
  // AppFrame gives it the same sidebar/top-bar shell as every other app route.
  if (process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1") {
    return (
      <AppFrame>
        <DashboardPage />
      </AppFrame>
    )
  }
  redirect("/dashboard")
}
