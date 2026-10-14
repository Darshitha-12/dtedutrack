"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";

const StudyFlowChart = dynamic(() => import("@/components/study-flow/study-flow-chart"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[420px] place-items-center text-sm text-muted-foreground">
      Loading study flow…
    </div>
  ),
});

export default function StudyFlowPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Study Flow"
        description="Plan your day as a flowchart — drag boxes, connect arrows and edit tasks. Saved on this device."
      />
      <StudyFlowChart />
    </div>
  );
}
