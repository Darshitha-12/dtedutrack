"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "next-auth/react";
import {
  User,
  BookOpen,
  GraduationCap,
  Globe,
  Save,
  Check,
  Loader2,
  AlertCircle,
  Target,
  Calendar,
  Clock,
  Star,
  AlertTriangle,
} from "lucide-react";

interface ProfileData {
  name: string;
  email: string;
  avatarUrl?: string;
  dailyTargetHours: number;
  weeklyTargetHours: number;
  preferredStudyTime: string;
  currentLevel: string;
  examYear: string;
  examDate: string;
  examType: string;
  targetGrade: string;
  weakTopics: string[];
  language: "en" | "si";
  onboarded: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ProfilePage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    email: "",
    avatarUrl: undefined,
    dailyTargetHours: 4,
    weeklyTargetHours: 28,
    preferredStudyTime: "morning",
    currentLevel: "O/L",
    examYear: "",
    examDate: "",
    examType: "A/L",
    targetGrade: "A",
    weakTopics: [],
    language: "en",
    onboarded: false,
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [weakTopicsInput, setWeakTopicsInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (saveState === "saved") {
      showToast("Profile saved successfully!", "success");
      const timeout = setTimeout(() => setSaveState("idle"), 2000);
      return () => clearTimeout(timeout);
    }
    if (saveState === "error") {
      showToast("Failed to save profile. Please try again.", "error");
      const timeout = setTimeout(() => setSaveState("idle"), 3000);
      return () => clearTimeout(timeout);
    }
  }, [saveState, showToast]);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.name || "",
          email: data.email || session?.user?.email || "",
          avatarUrl: data.avatarUrl || undefined,
          dailyTargetHours: data.dailyTargetHours || 4,
          weeklyTargetHours: data.weeklyTargetHours || 28,
          preferredStudyTime: data.preferredStudyTime || "morning",
          currentLevel: data.currentLevel || "O/L",
          examYear: data.examYear || "",
          examDate: data.examDate ? new Date(data.examDate).toISOString().split("T")[0] : "",
          examType: data.examType || "A/L",
          targetGrade: data.targetGrade || "A",
          weakTopics: data.weakTopics || [],
          language: data.language || "en",
          onboarded: data.onboarded || false,
        });
        setWeakTopicsInput((data.weakTopics || []).join(", "));
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  }

  function validateInputs(): boolean {
    if (!profile.name.trim()) {
      showToast("Name is required", "error");
      return false;
    }
    if (profile.dailyTargetHours < 0 || profile.dailyTargetHours > 24) {
      showToast("Daily target must be between 0 and 24 hours", "error");
      return false;
    }
    if (profile.weeklyTargetHours < 0 || profile.weeklyTargetHours > 168) {
      showToast("Weekly target must be between 0 and 168 hours", "error");
      return false;
    }
    if (profile.examDate) {
      const examDate = new Date(profile.examDate);
      if (isNaN(examDate.getTime())) {
        showToast("Invalid exam date", "error");
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    if (!validateInputs()) return;
    setSaveState("saving");
    try {
      const weakTopics = weakTopicsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const payload = {
        name: profile.name,
        fullName: profile.name,
        language: profile.language,
        examYear: profile.examYear ? Number(profile.examYear) : undefined,
        examDate: profile.examDate || undefined,
        examType: profile.examType,
        dailyStudyTarget: Number(profile.dailyTargetHours),
        weeklyStudyTarget: Number(profile.weeklyTargetHours),
        preferredTime: profile.preferredStudyTime,
        targetGrade: profile.targetGrade,
        currentLevel: profile.currentLevel,
        weakTopics,
      };

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setProfile((prev) => ({ ...prev, weakTopics }));
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  function updateProfile(field: keyof ProfileData, value: any) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function getSaveButtonIcon() {
    switch (saveState) {
      case "saving":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "saved":
        return <Check className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Save className="h-4 w-4" />;
    }
  }

  function getSaveButtonText() {
    switch (saveState) {
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved!";
      case "error":
        return "Try Again";
      default:
        return "Save Changes";
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader title="Profile" description="Manage your account settings and preferences" />

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>

          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Profile"
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {profile.name ? getInitials(profile.name) : "U"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={profile.name}
                  onChange={(e) => updateProfile("name", e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={profile.email}
                  disabled
                  className="bg-muted"
                  placeholder="Email address"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Study Preferences Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Study Preferences</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Target (hours)</label>
              <Input
                type="number"
                min={0}
                max={24}
                value={profile.dailyTargetHours}
                onChange={(e) => updateProfile("dailyTargetHours", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Weekly Target (hours)</label>
              <Input
                type="number"
                min={0}
                max={168}
                value={profile.weeklyTargetHours}
                onChange={(e) => updateProfile("weeklyTargetHours", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Study Time</label>
              <select
                value={profile.preferredStudyTime}
                onChange={(e) => updateProfile("preferredStudyTime", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="morning">Morning (6AM - 12PM)</option>
                <option value="afternoon">Afternoon (12PM - 6PM)</option>
                <option value="evening">Evening (6PM - 12AM)</option>
                <option value="night">Night (12AM - 6AM)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Level</label>
              <select
                value={profile.currentLevel}
                onChange={(e) => updateProfile("currentLevel", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="O/L">O/L (Ordinary Level)</option>
                <option value="A/L">A/L (Advanced Level)</option>
                <option value="University">University</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Exam Information Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Exam Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Exam Year</label>
              <Input
                value={profile.examYear}
                onChange={(e) => updateProfile("examYear", e.target.value)}
                placeholder="e.g., 2026"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Exam Date</label>
              <Input
                type="date"
                value={profile.examDate}
                onChange={(e) => updateProfile("examDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Exam Type</label>
              <select
                value={profile.examType}
                onChange={(e) => updateProfile("examType", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="O/L">O/L</option>
                <option value="A/L">A/L</option>
                <option value="University">University</option>
                <option value="Professional">Professional</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Grade</label>
              <select
                value={profile.targetGrade}
                onChange={(e) => updateProfile("targetGrade", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
                <option value="S">S</option>
                <option value="F">F</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Weak Topics (comma separated)</label>
              <Input
                value={weakTopicsInput}
                onChange={(e) => setWeakTopicsInput(e.target.value)}
                placeholder="e.g., Calculus, Organic Chemistry, Physics"
              />
              <p className="text-xs text-muted-foreground">
                Enter topics you find difficult, separated by commas
              </p>
            </div>
          </div>
        </Card>

        {/* Language Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Language</h2>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Language</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateProfile("language", "en")}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                  profile.language === "en"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                🇬🇧 English
              </button>
              <button
                type="button"
                onClick={() => updateProfile("language", "si")}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                  profile.language === "si"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                🇱🇰 සිංහල
              </button>
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end sticky bottom-4">
          <Button
            onClick={handleSave}
            disabled={saveState === "saving"}
            size="lg"
            className={`min-w-[160px] ${
              saveState === "saved"
                ? "bg-green-600 hover:bg-green-700"
                : saveState === "error"
                ? "bg-destructive hover:bg-destructive/90"
                : ""
            }`}
          >
            {getSaveButtonIcon()}
            <span className="ml-2">{getSaveButtonText()}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}