import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AppFrame } from "@/components/layout/app-frame"

// The offline APK is a static export: there is no server, no session cookie and no
// /login to redirect to. NEXT_PUBLIC_* is inlined at build time, so in the offline
// build this condition folds to `false` and the auth() call below is never executed
// (calling it would hit cookies() and fail `output: "export"` at build time).
const OFFLINE = process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!OFFLINE) {
    const session = await auth()
    if (!session?.user?.id) {
      redirect("/login")
    }
  }

  return <AppFrame>{children}</AppFrame>
}
