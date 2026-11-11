"use client";

import { CyberDTChat } from "@/features/ai/client/cyber-dt-chat";

export default function CyberDTPage() {
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
      <CyberDTChat />
    </div>
  );
}
