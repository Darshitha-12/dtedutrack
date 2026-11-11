"use client";

import { useEffect } from "react";
import { startAccountSync } from "@/lib/account-sync";

/**
 * Headless mount point for the account sync loop. Lives inside AppFrame so the
 * pull/push cycle runs on every in-app route for both the web app and the APK.
 */
export function AccountSyncPortal() {
  useEffect(() => startAccountSync(), []);
  return null;
}
