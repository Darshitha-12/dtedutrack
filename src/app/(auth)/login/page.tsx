"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { Loader2, AlertCircle, ArrowLeft, Mail, ShieldCheck, Zap } from "lucide-react";

type Purpose = "login" | "register";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [purpose, setPurpose] = useState<Purpose>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState("");
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = useCallback(async (p: Purpose, mail: string, displayName?: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: mail,
          purpose: p,
          ...(p === "register" && displayName ? { name: displayName } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.resendIn) {
          setResendIn(data.resendIn);
          setError(data.error || "Please wait before requesting another code.");
        } else {
          setError(data.error || "Failed to send the code. Please try again.");
          // Email provider not configured on this deploy — fall back to password
          // sign-in so users are never locked out (avoids the "looks like a new
          // user" loop where they can't get back into their account).
          if (p === "login") {
            setStep("password");
            setPassword("");
          }
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
  }, []);

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    requestOtp(purpose, email.trim(), name);
  };

  const handleResend = () => {
    requestOtp(purpose, email.trim(), name);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const r = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (r?.error) {
        setError("Invalid email or password. Please try again.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
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
        body: JSON.stringify({ email: email.trim(), code: c, purpose, name }),
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

  const showPasswordForm = () => {
    setStep("password");
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-sm p-6 space-y-6 glass">
        <div className="text-center space-y-2">
          <div className="text-4xl mb-2">🧬</div>
          <h1 className="text-2xl font-bold">
            {step === "otp" ? "Verify your email" : step === "password" ? "Sign in" : "Welcome to BioPulse"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "otp"
              ? `We sent a 6-digit code to ${email}`
              : step === "password"
              ? "Sign in with your password instead"
              : purpose === "login"
              ? "Sign in to continue studying"
              : "Create an account to start studying"}
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
            {/* Purpose toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPurpose("login");
                  setError("");
                }}
                className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                  purpose === "login"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                <Mail className="h-4 w-4" /> Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setPurpose("register");
                  setError("");
                }}
                className={`flex items-center justify-center gap-2 h-10 rounded-md border text-sm font-medium transition-colors ${
                  purpose === "register"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                Create account
              </button>
            </div>

            {purpose === "register" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Your name</label>
                <Input
                  type="text"
                  placeholder="e.g., Nimal Perera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

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

            <p className="text-center text-xs text-muted-foreground">
              Prefer your password?{" "}
              <button
                type="button"
                onClick={showPasswordForm}
                className="text-primary hover:underline font-medium"
              >
                Sign in with password
              </button>
            </p>
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
                onClick={() => {
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

        {step === "password" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
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
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError("");
              }}
              className="flex items-center gap-1 mx-auto text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to email code
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Sign up with password
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