"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { disconnectAccount } from "@/lib/account-sync";
import {
  listLinkedDevices,
  removeLinkedDevice,
  type LinkedDevice,
} from "@/lib/account-devices";
import { Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Shows every device linked to the account so the user can see and revoke them
 * from any device. Works on the web (cookie session) and in the APK (device
 * token), which is why requests go through /api/account/devices.
 */
export function ConnectedDevicesCard() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listLinkedDevices();
    setLoading(false);
    if (res.ok) {
      setDevices(res.devices);
      setError("");
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = useCallback(
    async (device: LinkedDevice) => {
      setRemoving(device.tokenPrefix);
      const res = await removeLinkedDevice(device.tokenPrefix);
      setRemoving("");
      if (!res.ok) {
        showToast(res.error || "Could not unlink that device.", "error");
        return;
      }
      if (device.current) disconnectAccount();
      setDevices((prev) => prev.filter((d) => d.tokenPrefix !== device.tokenPrefix));
      showToast(device.current ? "This device is no longer linked." : "Device unlinked.", "success");
    },
    [showToast],
  );

  return (
    <Card className="p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Connected devices</h2>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Every device linked to this account sees the same profile, study data and Cyber DT chat
        history. Unlinking a device removes its access immediately.
      </p>

      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {loading && devices.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading devices…</p>
      ) : devices.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No phone or tablet linked yet. Link one from its Cloud sync card.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((device) => (
            <li key={device.tokenPrefix} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/40">
                <Smartphone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {device.label}
                  {device.current && (
                    <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active {relativeTime(device.lastSeen)} · linked{" "}
                  {new Date(device.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleRemove(device)}
                disabled={removing === device.tokenPrefix}
                className="shrink-0"
              >
                {removing === device.tokenPrefix ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span className="ml-1 hidden sm:inline">Unlink</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
