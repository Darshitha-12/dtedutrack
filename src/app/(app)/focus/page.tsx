import { PageHeader } from "@/components/ui/page-header";
import { PomodoroTimer } from "@/features/pomodoro/components/PomodoroTimer";

export default function FocusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus Engine"
        description="Pomodoro timer and deep-work sessions — works offline"
      />
      <PomodoroTimer />
    </div>
  );
}