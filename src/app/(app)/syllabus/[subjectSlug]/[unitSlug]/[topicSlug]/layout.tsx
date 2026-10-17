import manifest from "@/generated/offline-manifest.json"

export function generateStaticParams({
  params,
}: {
  params: { subjectSlug: string; unitSlug: string }
}) {
  if (process.env.NEXT_PUBLIC_OFFLINE_BUILD !== "1") return []
  return manifest.topicParams
    .filter((p) => p.subjectSlug === params.subjectSlug && p.unitSlug === params.unitSlug)
    .map((p) => ({ topicSlug: p.topicSlug }))
}

export default function TopicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
