"use client";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Timer } from "lucide-react";

export default function FocusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus Engine"
        description="Pomodoro timer and deep-work sessions"
      />
      <EmptyState
        icon="⏱️"
        title="Pomodoro Timer"
        description="Start focused study sessions with timed breaks. Coming in a future phase."
      />
    </div>
  );
}
