"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, AlertCircle, ArrowLeft, Zap, ShieldCheck } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", email: "" });

  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  async function sendOtp() {
    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!form.email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), purpose: "register" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.resendIn) {
          setResendIn(data.resendIn);
          setError(data.error || "Please wait before requesting another code.");
        } else {
          setError(data.error || "Failed to send the code. Please try again.");
        }
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
  }

  async function handleVerify(e: React.FormEvent) {
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
        body: JSON.stringify({
          email: form.email.trim(),
          code: c,
          purpose: "register",
          name: form.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        return;
      }

      const r = await signIn("credentials", {
        email: form.email.trim(),
        otpToken: data.token as string,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (r?.error) {
        setError("Sign-in failed. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-sm p-6 space-y-6 glass">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🧬</div>
          <h1 className="text-2xl font-bold">
            {step === "otp" ? "Verify your email" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "otp"
              ? `We sent a 6-digit code to ${form.email}`
              : "Start your Biology study journey"}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {devCode && step === "otp" && (
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

        {step === "form" && (
          <form onSubmit={(e) => { e.preventDefault(); sendOtp(); }} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Full name</label>
              <Input
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
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
                "Create account & continue"
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground space-y-2">
              {resendIn > 0 ? (
                <p>Resend code in {resendIn}s</p>
              ) : (
                <button type="button" onClick={sendOtp} className="text-primary hover:underline font-medium">
                  Resend code
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setCode("");
                  setError("");
                }}
                className="flex items-center gap-1 mx-auto text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Change details
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}