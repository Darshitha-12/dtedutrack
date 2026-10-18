"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { credentialsSignIn } from "@/lib/client-auth";
import { connectAccount, disconnectAccount } from "@/lib/account-sync";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, AlertCircle, Lock, Mail, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: refreshSession } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passwordReset = searchParams.get("passwordReset") === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // The APK has no cookie session, so the device token IS the credential and it
      // must be minted on every sign-in: a token left over from an older database
      // would otherwise be kept and leave Messages / cloud sync unauthenticated.
      // A wrong password therefore fails here (when online) instead of silently
      // "succeeding" locally and then breaking every server call.
      if (process.env.NEXT_PUBLIC_OFFLINE_BUILD === "1") {
        const link = await connectAccount(email.trim(), password, "BioPulse device");
        if (!link.ok && navigator.onLine) {
          disconnectAccount();
          setError(link.error || "Incorrect email or password.");
          return;
        }
      }

      const r = await credentialsSignIn(email.trim(), password, callbackUrl);
      if (!r.ok) {
        setError(r.error || "Sign-in failed. Please try again.");
        return;
      }
      // Refresh the cached session so the sidebar/topbar show the identity
      // that was just signed in (the offline shim re-reads it from the store).
      try {
        await refreshSession();
      } catch {
        // Best-effort: never block navigation on a session refetch.
      }
      router.push(r.url || callbackUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-sm p-6 space-y-6 bg-card border-border shadow-xl">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🧬</div>
          <h1 className="text-2xl font-bold">Welcome to BioPulse</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue studying
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {passwordReset && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/25 p-3 text-sm">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Password updated. Sign in with your new password.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground mb-1 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                required
                autoComplete="current-password"
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Create account
          </Link>
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}