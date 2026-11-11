import manifest from "@/generated/offline-manifest.json"

export function generateStaticParams({ params }: { params: { subjectSlug: string } }) {
  if (process.env.NEXT_PUBLIC_OFFLINE_BUILD !== "1") return []
  return manifest.unitParams
    .filter((p) => p.subjectSlug === params.subjectSlug)
    .map((p) => ({ unitSlug: p.unitSlug }))
}

export default function UnitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
