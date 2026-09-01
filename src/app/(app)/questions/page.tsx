"use client";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function QuestionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Question Bank"
        description="Practice questions organised by topic and difficulty"
      />
      <EmptyState
        icon="🚧"
        title="Question Bank"
        description="Coming in a future phase."
      />
    </div>
  );
}
