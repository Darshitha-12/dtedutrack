"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Send, Loader2, ArrowLeft, ShieldCheck, Bell } from "lucide-react";
import { useT } from "@/lib/language-context";
import { nativeBridge } from "@/lib/native-shell";

type Phase = "opening" | "opened" | "unavailable";

/**
 * Telegram runs as Telegram Web (web.telegram.org/a) hosted full-screen inside the app, so it looks
 * and feels like the native Android app. This page hands the user over to that window.
 */
export default function TelegramPage() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("opening");

  const launch = () => {
    const bridge = nativeBridge();
    if (!bridge?.openTelegramWeb) {
      setPhase("unavailable");
      return;
    }
    bridge.openTelegramWeb();
    setPhase("opened");
  };

  useEffect(() => {
    launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <MessageCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">{t("tg.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("tg.subtitle")}</p>
        </div>

        {phase === "unavailable" ? (
          <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
            {t("tg.nativeUnavailable")}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {phase === "opening" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("tg.opening")}
                </>
              ) : (
                t("tg.nativeHint")
              )}
            </div>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              onClick={launch}
            >
              <Send className="h-4 w-4" />
              {t("tg.open")}
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("tg.safe")}
        </div>

        <button
          className="mx-auto flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("tg.back")}
        </button>

        {phase !== "unavailable" && (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-left dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 text-amber-500" /> {t("tg.notifSetup")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("tg.notifSetupHint")}</p>
            <button
              className="mt-3 w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
              onClick={() => nativeBridge()?.enableTelegramNotifications?.()}
            >
              {t("tg.notifSetup")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
