"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  User,
  Globe,
  Calendar,
  Target,
  Check,
  Loader2,
  SkipForward,
} from "lucide-react";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "name", title: "Your Name" },
  { id: "language", title: "Language" },
  { id: "exam", title: "Exam Info" },
  { id: "goals", title: "Study Goals" },
  { id: "finish", title: "All Set!" },
];

interface OnboardingData {
  name: string;
  language: "en" | "si";
  examYear: string;
  examDate: string;
  dailyTargetHours: number;
  currentLevel: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: "",
    language: "en",
    examYear: "",
    examDate: "",
    dailyTargetHours: 4,
    currentLevel: "O/L",
  });

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  function updateData(field: keyof OnboardingData, value: any) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function validateCurrentStep(): boolean {
    switch (currentStep) {
      case 1:
        if (!data.name.trim()) return false;
        return true;
      case 3:
        if (!data.examYear.trim()) return false;
        return true;
      case 4:
        if (data.dailyTargetHours < 1 || data.dailyTargetHours > 12) return false;
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (!validateCurrentStep()) return;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  function handleSkip() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.name,
          language: data.language,
          examYear: data.examYear ? Number(data.examYear) : undefined,
          examDate: data.examDate || undefined,
          dailyStudyTarget: data.dailyTargetHours,
          currentLevel: data.currentLevel,
          weakTopics: [],
        }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        console.error("Failed to complete onboarding", await res.text());
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderStep() {
    switch (currentStep) {
      case 0:
        return (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
                <Sparkles className="h-12 w-12 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-3">Welcome to BioPulse</h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Your personal study companion. Let&apos;s set up your profile to get started.
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">What&apos;s your name?</h2>
              <p className="text-muted-foreground">We&apos;ll use this to greet you</p>
            </div>
            <div className="max-w-sm mx-auto space-y-4">
              <Input
                value={data.name}
                onChange={(e) => updateData("name", e.target.value)}
                placeholder="Enter your full name"
                className="text-center text-lg"
                autoFocus
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Globe className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Choose your language</h2>
              <p className="text-muted-foreground">Select your preferred language</p>
            </div>
            <div className="max-w-sm mx-auto flex gap-4">
              <button
                onClick={() => updateData("language", "en")}
                className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-lg border-2 transition-all ${
                  data.language === "en"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:border-primary/50"
                }`}
              >
                <span className="text-xl">🇬🇧</span>
                <span className="font-medium">English</span>
              </button>
              <button
                onClick={() => updateData("language", "si")}
                className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-lg border-2 transition-all ${
                  data.language === "si"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:border-primary/50"
                }`}
              >
                <span className="text-xl">🇱🇰</span>
                <span className="font-medium">සිංහල</span>
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Exam Information</h2>
              <p className="text-muted-foreground">Tell us about your upcoming exam</p>
            </div>
            <div className="max-w-sm mx-auto space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Year</label>
                <Input
                  value={data.examYear}
                  onChange={(e) => updateData("examYear", e.target.value)}
                  placeholder="e.g., 2026"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Date (optional)</label>
                <Input
                  type="date"
                  value={data.examDate}
                  onChange={(e) => updateData("examDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Level</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateData("currentLevel", "O/L")}
                    className={`flex-1 h-10 rounded-md border transition-colors ${
                      data.currentLevel === "O/L"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent"
                    }`}
                  >
                    O/L
                  </button>
                  <button
                    onClick={() => updateData("currentLevel", "A/L")}
                    className={`flex-1 h-10 rounded-md border transition-colors ${
                      data.currentLevel === "A/L"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent"
                    }`}
                  >
                    A/L
                  </button>
                  <button
                    onClick={() => updateData("currentLevel", "University")}
                    className={`flex-1 h-10 rounded-md border transition-colors ${
                      data.currentLevel === "University"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent"
                    }`}
                  >
                    Uni
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Set your goals</h2>
              <p className="text-muted-foreground">How many hours do you want to study daily?</p>
            </div>
            <div className="max-w-sm mx-auto space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Daily Study Target (hours)</label>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateData("dailyTargetHours", Math.max(1, data.dailyTargetHours - 1))
                    }
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={data.dailyTargetHours}
                    onChange={(e) => updateData("dailyTargetHours", Number(e.target.value))}
                    className="text-center text-2xl font-bold w-24"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateData("dailyTargetHours", Math.min(12, data.dailyTargetHours + 1))
                    }
                  >
                    +
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Recommended: 4-6 hours for exam preparation
                </p>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                <Check className="h-12 w-12 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-3">You&apos;re all set!</h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Your profile is ready. Start your study journey with BioPulse.
              </p>
            </div>
            <div className="max-w-sm mx-auto bg-card rounded-lg p-4 border">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{data.name || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Language:</span>
                  <span className="font-medium">{data.language === "en" ? "English" : "සිංහල"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exam Year:</span>
                  <span className="font-medium">{data.examYear || "Not set"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Target:</span>
                  <span className="font-medium">{data.dailyTargetHours} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Level:</span>
                  <span className="font-medium">{data.currentLevel}</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;
  const canProceed = validateCurrentStep();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      {/* Progress Bar */}
      <div className="w-full bg-muted h-1">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Indicator */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index < currentStep
                    ? "bg-primary text-primary-foreground"
                    : index === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${
                    index < currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 flex items-center justify-center container mx-auto px-4 py-8">
        <div className="w-full max-w-lg">{renderStep()}</div>
      </div>

      {/* Navigation Buttons */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            {!isFirstStep && (
              <Button variant="ghost" onClick={handleBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isFirstStep && !isLastStep && (
              <Button variant="ghost" onClick={handleSkip} className="gap-2">
                Skip
                <SkipForward className="h-4 w-4" />
              </Button>
            )}

            {isFirstStep ? (
              <Button onClick={handleNext} className="gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : isLastStep ? (
              <Button
                onClick={handleFinish}
                disabled={isSubmitting}
                size="lg"
                className="gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isSubmitting ? "Setting up..." : "Start Learning"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed} className="gap-2">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}