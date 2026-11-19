"use client";

import { useEffect, useState } from "react";
import { CyberDTChat } from "@/features/ai/client/cyber-dt-chat";
import {
  CYBER_DT_FEATURES,
  CyberDTEssayEvaluator,
  CyberDTExamTracker,
  CyberDTFeatures,
  CyberDTFlashcards,
  CyberDTOrganicAssistant,
  CyberDTSolver,
  type CyberDTFeatureId,
} from "@/features/ai/client/cyber-dt-features";
import { CyberDTPdfNotes } from "@/features/ai/client/cyber-dt-pdf-notes";

/**
 * Maps the tool names Cyber DT returns in a `navigate_or_open_tool` action to
 * the workspace feature ids. The Diagram Lab and Question Bank live on their
 * own routes, so the action executor navigates there directly.
 */
const TOOL_TO_FEATURE: Record<string, CyberDTFeatureId> = {
  essay_evaluator: "essay_eval",
  flashcards: "flashcards",
  organic_assistant: "organic",
};

function FeatureWorkspace({
  activeFeature,
  starter,
  topic,
}: {
  activeFeature: CyberDTFeatureId | null;
  starter?: string;
  topic?: string;
}) {
  switch (activeFeature) {
    case "calc_guide":
      return <CyberDTSolver />;
    case "essay_eval":
      return <CyberDTEssayEvaluator initialTopic={topic} />;
    case "flashcards":
      return <CyberDTFlashcards initialTopic={topic} />;
    case "organic":
      return <CyberDTOrganicAssistant initialTopic={topic} />;
    case "pdf_notes":
      return <CyberDTPdfNotes />;
    default:
      return <CyberDTChat key={activeFeature ?? "chat"} starter={starter} />;
  }
}

export default function CyberDTPage() {
  const [activeFeature, setActiveFeature] = useState<CyberDTFeatureId | null>(null);
  const [topic, setTopic] = useState("");
  const feature = CYBER_DT_FEATURES.find((f) => f.id === activeFeature) ?? null;

  useEffect(() => {
    const openTool = (tool: string | undefined, nextTopic: string | undefined) => {
      const id = tool ? TOOL_TO_FEATURE[tool] : undefined;
      if (!id) return;
      setActiveFeature(id);
      setTopic(nextTopic?.trim() || "");
    };

    // "Open flashcards for photosynthesis" from the floating chat on another
    // page navigates here with ?tool=…&topic=…; the same-tab chat fires an event.
    const onOpenTool = (event: Event) => {
      const detail = (event as CustomEvent<{ tool?: string; topic?: string }>).detail;
      openTool(detail?.tool, detail?.topic);
    };
    window.addEventListener("cyberdt:open-tool", onOpenTool);

    const params = new URLSearchParams(window.location.search);
    if (params.get("tool")) openTool(params.get("tool") || undefined, params.get("topic") || undefined);

    return () => window.removeEventListener("cyberdt:open-tool", onOpenTool);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-gradient font-display text-2xl font-extrabold tracking-tight text-cyan-200">
          Cyber DT AI
        </h1>
        <p className="text-sm text-cyan-400/70">
          Neon-powered study companion — free, offline, unlimited replies.
        </p>
      </div>
      <CyberDTExamTracker />
      <CyberDTFeatures
        activeFeature={activeFeature}
        setActiveFeature={(id) => {
          setTopic("");
          setActiveFeature((current) => (current === id ? null : id));
        }}
      />
      <FeatureWorkspace
        key={`${activeFeature ?? "chat"}|${topic}`}
        activeFeature={activeFeature}
        starter={feature?.starter}
        topic={topic}
      />
    </div>
  );
}
