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
        description="Sign in to Telegram right here in the app."
      />
      <Card>
        <CardContent className="p-6 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Send className="h-5 w-5 text-sky-500" />
            <h2 className="text-lg font-semibold">Opening Telegram…</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The full Telegram login screen is opening inside the app. Enter your phone
            number, then the OTP, and you&apos;re in — no need to leave BioPulse.
          </p>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}
