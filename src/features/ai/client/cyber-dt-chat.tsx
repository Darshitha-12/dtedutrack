"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/language-context";
import { nativeBridge } from "@/lib/native-shell";
import { generateCyberDTResponse, getCyberDTGreeting, type CyberDTResponse } from "@/features/ai/client/cyber-dt-ai";
import { type AIMode } from "@/features/ai/types";

type CyberDTChatProps = {
  locale: "en" | "si";
  onUserMessage: (message: string) => void;
  onAISend: (response: CyberDTResponse) => void;
  mode?: AIMode;
};

export function CyberDTChat({ locale, onUserMessage, onAISend, mode }: CyberDTChatProps) {
  const t = useT();
  const [response, setResponse] = useState<CyberDTResponse | null>(null);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);

  useEffect(() => {
    if (autoReplyEnabled) {
      const initialResponse = getCyberDTGreeting();
      setResponse(initialResponse);
      onAISend(initialResponse);
    }
  }, [autoReplyEnabled, onAISend]);

  useEffect(() => {
    if (!autoReplyEnabled) return;
    let debounceTimer: NodeJS.Timeout;

    const handleMessage = (message: string) => {
      if (!message.trim()) return;
      setIsTyping(true);
      const aiResponse = generateCyberDTResponse(message);
      debounceTimer = setTimeout(() => {
        setIsTyping(false);
        setResponse(aiResponse);
        onAISend(aiResponse);
      }, 500);
      return () => clearTimeout(debounceTimer);
    };

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [autoReplyEnabled, onAISend]);

  const [isTyping, setIsTyping] = useState(false);

  const handleSend = (message: string) => {
    onUserMessage(message);
    const aiResponse = generateCyberDTResponse(message);
    setResponse(aiResponse);
    onAISend(aiResponse);
  };

  useEffect(() => {
    const bridge = nativeBridge();
    if (!bridge?.telegramNativeAvailable) return;

    const handleIncomingMessage = (name: string, text: string) => {
      if (!autoReplyEnabled) return;
      const aiResponse = generateCyberDTResponse(text);
      setResponse(aiResponse);
      onAISend(aiResponse);
      try {
        bridge.showChatNotification?.("Cyber DT AI", "Auto-reply", "cyber-dt-ai");
      } catch {}
    };

    return () => {};
  }, [autoReplyEnabled, onAISend]);

  if (!response) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 p-4 max-w-md rounded-xl bg-gray-800 border border-cyan-500 shadow-lg">
      Cyber DT AI: {response.emoji} Auto-reply active
    </div>
  );
}
