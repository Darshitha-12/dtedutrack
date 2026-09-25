"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { credentialsSignIn } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { registerSchema, type RegisterInput } from "@/lib/validations";
import { Loader2, AlertCircle, CheckCircle, ArrowLeft, Zap, ShieldCheck } from "lucide-react";

type Method = "otp" | "password";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<Method>("otp");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<RegisterInput>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

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
      return false;
    }
    if (!form.email.trim()) {
      setError("Please enter your email address.");
      return false;
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
        return false;
      }
      setDevCode(data.devCode ?? null);
      setStep("otp");
      setResendIn(60);
      return true;
    } catch {
      setError("An unexpected error occurred. Please try again.");
      return false;
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
        body: JSON.stringify({ email: form.email.trim(), code: c, purpose: "register", name: form.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        return;
      }
      const r = await credentialsSignIn(
        form.email.trim(),
        data.token as string,
        window.location.href,
      );
      if (!r.ok) {
        setError(r.error || "Sign-in failed. Please try again.");
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = registerSchema.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed. Please try again.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="w-full max-w-sm p-6 space-y-6 glass text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Account created!</h1>
            <p className="text-sm text-muted-foreground">
              Your account has been created successfully. Please sign in to continue.
            </p>
          </div>
          <Link href="/login">
            <Button className="w-full">Sign in</Button>
          </Link>
        </Card>
      </div>
    );
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
          <form onSubmit={method === "otp" ? sendOtp : handlePasswordSubmit} className="space-y-4">
            {/* Method toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setMethod("otp"); setError(""); }}
                className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                  method === "otp"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                <ShieldCheck className="h-4 w-4" /> Email code
              </button>
              <button
                type="button"
                onClick={() => { setMethod("password"); setError(""); }}
                className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                  method === "password"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                Password
              </button>
            </div>

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

            {method === "password" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                  <Input
                    type="password"
                    placeholder="Min 8 chars, mixed case + number"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Confirm password</label>
                  <Input
                    type="password"
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    required
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {method === "otp" ? "Sending code..." : "Creating account..."}
                </>
              ) : method === "otp" ? (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Continue with email code
                </>
              ) : (
                "Create account"
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
                <button
                  type="button"
                  onClick={sendOtp}
                  className="text-primary hover:underline font-medium"
                >
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