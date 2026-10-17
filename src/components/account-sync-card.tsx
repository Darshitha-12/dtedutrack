"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  connectAccount,
  disconnectAccount,
  getSyncState,
  hasToken,
  isOfflineBuild,
  runSync,
  subscribeSync,
  type SyncState,
} from "@/lib/account-sync";

function statusLine(s: SyncState): string {
  switch (s.status) {
    case "syncing":
      return "Syncing…";
    case "ok":
      return s.lastSyncedAt
        ? `Last synced ${new Date(s.lastSyncedAt).toLocaleString()}`
        : "Up to date";
    case "error":
      return `Sync problem: ${s.error || "offline"}`;
    case "no-account":
      return "Not linked to an account yet.";
    default:
      return "Will sync automatically.";
  }
}

/**
 * Links a device to the user's email account so reminders, alarms and the daily
 * study flow appear on every device. On the web the account is already signed in
 * (cookie session); in the Android APK the user enters their email + password
 * once to mint a device token.
 */
export function AccountSyncCard() {
  const { showToast } = useToast();
  const [state, setState] = useState<SyncState>(() => getSyncState());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = isOfflineBuild();

  useEffect(() => subscribeSync(setState), []);

  const connected = state.connected || (!offline && state.status === "ok");

  const handleConnect = useCallback(async () => {
    if (!email.trim() || !password) {
      showToast("Enter your email and password.", "error");
      return;
    }
    setBusy(true);
    const res = await connectAccount(email.trim(), password, "BioPulse device");
    setBusy(false);
    if (res.ok) {
      setPassword("");
      showToast("Device linked. Syncing your data…", "success");
    } else {
      showToast(res.error || "Could not connect this device.", "error");
    }
  }, [email, password, showToast]);

  const handleSyncNow = useCallback(async () => {
    setBusy(true);
    await runSync();
    setBusy(false);
    showToast("Sync complete.", "success");
  }, [showToast]);

  const handleDisconnect = useCallback(() => {
    disconnectAccount();
    setEmail("");
    setPassword("");
    showToast("This device is no longer linked.", "success");
  }, [showToast]);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="inline-flex h-5 w-5 items-center justify-center text-primary">☁️</span>
        <h2 className="text-lg font-semibold">Cloud sync</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Your reminders, alarms and daily study flow sync to every device signed into the
        same email account.
      </p>

      {connected ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">
              Connected{state.email ? ` as ${state.email}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{statusLine(state)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleSyncNow} disabled={busy}>
              {busy ? "Syncing…" : "Sync now"}
            </Button>
            {offline && (
              <Button type="button" size="sm" variant="outline" onClick={handleDisconnect}>
                Unlink this device
              </Button>
            )}
          </div>
        </div>
      ) : offline ? (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sign in once (while online) to link this phone to your account.
          </p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="button" size="sm" onClick={handleConnect} disabled={busy}>
            {busy ? "Connecting…" : "Link this device"}
          </Button>
          {hasToken() === false && state.status !== "idle" && state.status !== "syncing" && (
            <p className="text-xs text-muted-foreground">{statusLine(state)}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{statusLine(state)}</p>
      )}
    </Card>
  );
}
