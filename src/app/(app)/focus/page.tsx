import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PomodoroTimer } from "@/features/pomodoro/components/PomodoroTimer";

export default function FocusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus Engine"
        description="Pomodoro timer and deep-work sessions — works offline"
      />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/40" />}>
        <PomodoroTimer />
      </Suspense>
    </div>
  );
}