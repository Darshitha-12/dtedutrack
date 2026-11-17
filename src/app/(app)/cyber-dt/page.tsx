"use client";

import { useState } from "react";
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

function FeatureWorkspace({
  activeFeature,
  starter,
}: {
  activeFeature: CyberDTFeatureId | null;
  starter?: string;
}) {
  switch (activeFeature) {
    case "calc_guide":
      return <CyberDTSolver />;
    case "essay_eval":
      return <CyberDTEssayEvaluator />;
    case "flashcards":
      return <CyberDTFlashcards />;
    case "organic":
      return <CyberDTOrganicAssistant />;
    case "pdf_notes":
      return <CyberDTPdfNotes />;
    default:
      return <CyberDTChat key={activeFeature ?? "chat"} starter={starter} />;
  }
}

export default function CyberDTPage() {
  const [activeFeature, setActiveFeature] = useState<CyberDTFeatureId | null>(null);
  const feature = CYBER_DT_FEATURES.find((f) => f.id === activeFeature) ?? null;

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
        setActiveFeature={(id) => setActiveFeature((current) => (current === id ? null : id))}
      />
      <FeatureWorkspace activeFeature={activeFeature} starter={feature?.starter} />
    </div>
  );
}
