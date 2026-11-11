"use client";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function TopicsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Topics & Revision"
        description="Spaced repetition and topic-wise revision tracker"
      />
      <EmptyState
        icon="🔄"
        title="Spaced Repetition"
        description="Review topics at optimal intervals for long-term retention. Coming in a future phase."
      />
    </div>
  );
}
