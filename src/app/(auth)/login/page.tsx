"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, AlertCircle, ArrowLeft, Mail, ShieldCheck, Zap } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), purpose: "login" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send the code. Please try again.");
        return;
      }
      setDevCode(data.devCode ?? null);
      setStep("otp");
      setResendIn(60);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    requestOtp();
  };

  const handleResend = () => {
    requestOtp();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (c.length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: c, purpose: "login" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        return;
      }

      const r = await signIn("credentials", {
        email: email.trim(),
        otpToken: data.token as string,
        redirect: false,
        callbackUrl,
      });
      if (r?.error) {
        setError("Sign-in failed. Please try again.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-sm p-6 space-y-6 glass">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🧬</div>
          <h1 className="text-2xl font-bold">
            {step === "otp" ? "Verify your email" : "Welcome to BioPulse"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "otp"
              ? `We sent a 6-digit code to ${email}`
              : "Sign in to continue studying"}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {devCode && (
          <div className="rounded-lg bg-primary/10 border border-primary/25 p-3 text-sm">
            <p className="font-medium text-primary mb-1 flex items-center gap-1.5">
              <Zap className="h-4 w-4" /> Development mode
            </p>
            <p className="text-muted-foreground mb-2">
              No email provider configured — use this code to sign in:
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-lg font-bold tracking-widest">{devCode}</code>
              <Button
                type="button"
                size="sm"
                onClick={() => setCode(devCode)}
                className="h-8 px-3 text-xs"
              >
                Use code
              </Button>
            </div>
          </div>
        )}

        {step === "email" && (
          <form onSubmit={handleEmailContinue} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending code...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Continue with email code
                </>
              )}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">6-digit code</label>
              <Input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                className="text-center text-2xl tracking-[0.5em] font-bold"
                required
                autoComplete="one-time-code"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & continue"
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground space-y-2">
              {resendIn > 0 ? (
                <p>Resend code in {resendIn}s</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-primary hover:underline font-medium"
                >
                  Resend code
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setStep("email");
                  setCode("");
                  setError("");
                }}
                className="flex items-center gap-1 mx-auto text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Change email
              </button>
            </div>
          </form>
        )}

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