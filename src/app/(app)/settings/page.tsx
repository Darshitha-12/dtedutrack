"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  Palette,
  Globe,
  Bell,
  BookOpen,
  Shield,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Save,
  Check,
  Loader2,
  AlertCircle,
  Trash2,
  Key,
  Mail,
  Smartphone,
  MessageSquare,
  Hash,
  Clock,
} from "lucide-react";

interface SettingsData {
  theme: "light" | "dark" | "system";
  language: "en" | "si";
  notifications: {
    browser: boolean;
    telegram: boolean;
    telegramToken: string;
    telegramChatId: string;
    ntfy: boolean;
    ntfyTopic: string;
    studyReminders: boolean;
  };
  pomodoro: {
    studyMinutes: number;
    breakMinutes: number;
    longBreakMinutes: number;
    cyclesBeforeLongBreak: number;
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<SettingsData>({
    theme: "system",
    language: "en",
    notifications: {
      browser: false,
      telegram: false,
      telegramToken: "",
      telegramChatId: "",
      ntfy: false,
      ntfyTopic: "",
      studyReminders: true,
    },
    pomodoro: {
      studyMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLongBreak: 4,
    },
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (saveState === "saved") {
      showToast("Settings saved!", "success");
      const timeout = setTimeout(() => setSaveState("idle"), 2000);
      return () => clearTimeout(timeout);
    }
    if (saveState === "error") {
      showToast("Failed to save settings.", "error");
      const timeout = setTimeout(() => setSaveState("idle"), 3000);
      return () => clearTimeout(timeout);
    }
  }, [saveState, showToast]);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.theme) setSettings((prev) => ({ ...prev, theme: data.theme }));
        if (data.language) setSettings((prev) => ({ ...prev, language: data.language }));
        if (data.notifications)
          setSettings((prev) => ({ ...prev, notifications: { ...prev.notifications, ...data.notifications } }));
        if (data.pomodoro)
          setSettings((prev) => ({ ...prev, pomodoro: { ...prev.pomodoro, ...data.pomodoro } }));
        if (data.userEmail) setUserEmail(data.userEmail);
        if (data.theme) applyTheme(data.theme);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  }

  function applyTheme(theme: "light" | "dark" | "system") {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(prefersDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }

    localStorage.setItem("theme", theme);
  }

  function updateTheme(theme: "light" | "dark" | "system") {
    setSettings((prev) => ({ ...prev, theme }));
    applyTheme(theme);
  }

  function updateNotification(key: keyof SettingsData["notifications"], value: any) {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  }

  function updatePomodoro(key: keyof SettingsData["pomodoro"], value: number) {
    setSettings((prev) => ({
      ...prev,
      pomodoro: { ...prev.pomodoro, [key]: value },
    }));
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (res.ok) {
        showToast("Account deleted. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        showToast("Failed to delete account.", "error");
      }
    } catch {
      showToast("Failed to delete account.", "error");
    } finally {
      setIsDeleting(false);
    }
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
        return "Save Settings";
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
      <PageHeader title="Settings" description="Customize your BioPulse experience" />

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Appearance Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Appearance</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => updateTheme("light")}
                  className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                    settings.theme === "light"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => updateTheme("dark")}
                  className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                    settings.theme === "dark"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => updateTheme("system")}
                  className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                    settings.theme === "system"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  System
                </button>
              </div>
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
            <label className="text-sm font-medium">Display Language</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, language: "en" }))}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                  settings.language === "en"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                🇬🇧 English
              </button>
              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, language: "si" }))}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-md border transition-colors ${
                  settings.language === "si"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                🇱🇰 සිංහල
              </button>
            </div>
          </div>
        </Card>

        {/* Notifications Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Notifications</h2>
          </div>

          <div className="space-y-4">
            {/* Browser Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Browser Notifications</p>
                  <p className="text-xs text-muted-foreground">Get notified in your browser</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateNotification("browser", !settings.notifications.browser)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications.browser ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.notifications.browser ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Telegram */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Telegram</p>
                    <p className="text-xs text-muted-foreground">Receive alerts via Telegram</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateNotification("telegram", !settings.notifications.telegram)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.notifications.telegram ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.notifications.telegram ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {settings.notifications.telegram && (
                <div className="ml-7 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Bot Token</label>
                    <Input
                      type="password"
                      value={settings.notifications.telegramToken}
                      onChange={(e) => updateNotification("telegramToken", e.target.value)}
                      placeholder="Enter bot token"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Chat ID</label>
                    <Input
                      value={settings.notifications.telegramChatId}
                      onChange={(e) => updateNotification("telegramChatId", e.target.value)}
                      placeholder="Enter chat ID"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Ntfy */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Ntfy</p>
                    <p className="text-xs text-muted-foreground">Push notifications via ntfy.sh</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateNotification("ntfy", !settings.notifications.ntfy)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.notifications.ntfy ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.notifications.ntfy ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {settings.notifications.ntfy && (
                <div className="ml-7 space-y-1">
                  <label className="text-xs font-medium">Topic</label>
                  <Input
                    value={settings.notifications.ntfyTopic}
                    onChange={(e) => updateNotification("ntfyTopic", e.target.value)}
                    placeholder="e.g., biopulse-alerts"
                  />
                </div>
              )}
            </div>

            {/* Study Reminders */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Study Reminders</p>
                  <p className="text-xs text-muted-foreground">Daily reminders to start studying</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateNotification("studyReminders", !settings.notifications.studyReminders)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.notifications.studyReminders ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.notifications.studyReminders ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* Study Preferences / Pomodoro Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Pomodoro Settings</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Study (min)</label>
              <Input
                type="number"
                min={1}
                max={120}
                value={settings.pomodoro.studyMinutes}
                onChange={(e) => updatePomodoro("studyMinutes", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Break (min)</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.pomodoro.breakMinutes}
                onChange={(e) => updatePomodoro("breakMinutes", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Long Break (min)</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.pomodoro.longBreakMinutes}
                onChange={(e) => updatePomodoro("longBreakMinutes", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cycles</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.pomodoro.cyclesBeforeLongBreak}
                onChange={(e) => updatePomodoro("cyclesBeforeLongBreak", Number(e.target.value))}
              />
            </div>
          </div>
        </Card>

        {/* Account Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">{userEmail || "Not set"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Change your account password</p>
              </div>
              <Button variant="outline" size="sm" disabled>
                Change Password
              </Button>
            </div>
          </div>
        </Card>

        {/* Danger Zone Card */}
        <Card className="p-6 border-destructive/50">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </Card>

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-full max-w-md mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="text-lg font-semibold">Delete Account</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                This action cannot be undone. All your data including alarms, study logs, and marks
                will be permanently deleted.
              </p>
              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm:
                </label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="font-mono"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete Account
                </Button>
              </div>
            </Card>
          </div>
        )}

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