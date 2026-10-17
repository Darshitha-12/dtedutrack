"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getIdentityEmail,
  getStoredToken,
  getSyncBaseUrl,
  getSyncState,
  getTrackedLocalKeys,
  isOfflineBuild,
  runSync,
  subscribeSync,
  type SyncState,
} from "@/lib/account-sync";

interface WhoamiResult {
  ok: boolean;
  method?: string;
  userId?: string;
  email?: string;
  tokenPrefix?: string;
  snapshotKeys?: number;
  updatedAt?: number;
  reason?: string;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "error";
}) {
  const color =
    tone === "error"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "";
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${color}`}>{value}</span>
    </div>
  );
}

/**
 * On-screen diagnostics for the account sync engine. Shows what identity the
 * phone/laptop is using, whether a device token exists, and what identity the
 * server resolves for this client (device token vs. cookie session) so a mismatch
 * is visible instead of silent.
 */
export function SyncDiagnostics() {
  const [syncState, setSyncState] = useState<SyncState>(() => getSyncState());
  const [whoami, setWhoami] = useState<WhoamiResult | null>(null);
  const [whoamiStatus, setWhoamiStatus] = useState("");
  const [snapshotStatus, setSnapshotStatus] = useState("");
  const [probing, setProbing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const offline = isOfflineBuild();

  useEffect(() => subscribeSync(setSyncState), []);
  useEffect(() => setMounted(true), []);

  const token = mounted ? getStoredToken() : "";
  const identity = mounted ? getIdentityEmail() : "";
  const base = getSyncBaseUrl();
  const tracked = mounted ? getTrackedLocalKeys() : [];

  const runProbe = useCallback(async () => {
    setProbing(true);
    setWhoami(null);
    setWhoamiStatus("probing…");
    setSnapshotStatus("probing…");
    try {
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      const who = await fetch(`${base}/api/account/whoami`, {
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      const whoBody = (await who.json().catch(() => null)) as WhoamiResult | null;
      setWhoami(whoBody);
      setWhoamiStatus(`HTTP ${who.status}`);

      const snap = await fetch(`${base}/api/account/snapshot`, {
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      const snapBody = (await snap.json().catch(() => null)) as
        | { data?: { kv?: Record<string, unknown> } }
        | null;
      const keyCount = snapBody?.data?.kv
        ? Object.keys(snapBody.data.kv).length
        : 0;
      setSnapshotStatus(`HTTP ${snap.status} · ${keyCount} keys`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      setWhoamiStatus(msg);
      setSnapshotStatus("failed");
    } finally {
      setProbing(false);
    }
  }, [base, token]);

  const whoamiValue = whoami
    ? whoami.ok
      ? `${whoamiStatus} · ${whoami.method} · ${whoami.email || "?"} · id ${(
          whoami.userId || ""
        ).slice(0, 10)}… · ${whoami.snapshotKeys ?? 0} keys`
      : `${whoamiStatus} · denied (${whoami.reason || "?"})`
    : whoamiStatus || "not run";

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-lg">🩺</span>
        <h2 className="text-lg font-semibold">Sync diagnostics</h2>
      </div>

      <div className="divide-y divide-border/50">
        <Row label="Build" value={offline ? "offline APK" : "web"} />
        <Row label="Sync base" value={base || "(empty)"} tone={base ? "ok" : "error"} />
        <Row
          label="Device token"
          value={token ? `present · ${token.slice(0, 8)}…` : "MISSING"}
          tone={token ? "ok" : "error"}
        />
        <Row
          label="Local identity"
          value={identity || "(none stored)"}
          tone={identity ? "ok" : "warn"}
        />
        <Row label="Tracked keys here" value={String(tracked.length)} />
        <Row
          label="Sync status"
          value={
            syncState.status +
            (syncState.error ? ` — ${syncState.error}` : "") +
            (syncState.lastSyncedAt
              ? ` @ ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
              : "")
          }
          tone={syncState.status === "error" ? "error" : undefined}
        />
        <Row
          label="Server identity"
          value={whoamiValue}
          tone={whoami ? (whoami.ok ? "ok" : "error") : undefined}
        />
        <Row
          label="Snapshot"
          value={snapshotStatus || "not run"}
          tone={
            snapshotStatus.startsWith("HTTP 200")
              ? "ok"
              : snapshotStatus && snapshotStatus !== "not run"
                ? "error"
                : undefined
          }
        />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Compare <strong>Local identity</strong> and <strong>Server identity</strong>{" "}
        here with the same panel on the laptop. If the phone shows{" "}
        <strong>MISSING</strong> token, tap “Link this device” above. If the emails
        differ, it is a separate account.
      </p>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={probing}
          onClick={runProbe}
        >
          {probing ? "Probing…" : "Run network probe"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            await runSync();
            setSyncing(false);
          }}
        >
          {syncing ? "Syncing…" : "Force sync"}
        </Button>
      </div>
    </Card>
  );
}
