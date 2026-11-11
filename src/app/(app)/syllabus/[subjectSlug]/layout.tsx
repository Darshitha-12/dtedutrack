import manifest from "@/generated/offline-manifest.json"

// Static export (offline APK) needs the slug list up front; the online build returns
// nothing so these pages keep rendering dynamically exactly as before.
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_OFFLINE_BUILD !== "1") return []
  return manifest.subjectParams
}

export default function SyllabusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
