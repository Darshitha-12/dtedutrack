"use client";

import { useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

type BridgeWindow = {
  BioPulseBridge?: {
    openTelegram?: () => void;
  };
};

function getBridge(): BridgeWindow["BioPulseBridge"] | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as BridgeWindow).BioPulseBridge;
}

export default function TelegramPage() {
  const appMode = getBridge() ? true : false;
  useEffect(() => {
    const bridge = getBridge();
    if (bridge && typeof bridge.openTelegram === "function") {
      try {
        bridge.openTelegram();
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <div className="container max-w-xl mx-auto p-4 lg:p-8">
      <PageHeader
        title="Telegram"
        description="Chat with your real Telegram account inside the app."
      />
      <Card>
        <CardContent className="p-6 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Send className="h-5 w-5 text-sky-500" />
            <h2 className="text-lg font-semibold">
              {appMode ? "Opening your Telegram…" : "Telegram lives in the app"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {appMode
              ? "Your chats open in the real Telegram screen. Sign in once with your phone number — it stays saved."
              : "Installing the Android APK gives you real Telegram chat inside BioPulse. From Home, tap the 💬 Telegram card."}
          </p>
          {!appMode && (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
