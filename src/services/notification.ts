import type { Alarm } from "@/features/alarms/types/alarm";

interface NotificationProvider {
  send(title: string, body: string, options?: Record<string, unknown>): Promise<boolean>;
}

class BrowserNotificationProvider implements NotificationProvider {
  async send(title: string, body: string, options?: Record<string, unknown>): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;

    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `bp-${Date.now()}`,
          renotify: true,
          ...options,
        } as NotificationOptions);
        return true;
      }

      new Notification(title, { body, ...options } as NotificationOptions);
      return true;
    } catch {
      return false;
    }
  }
}

class TelegramNotificationProvider implements NotificationProvider {
  constructor(private token: string, private chatId: string) {}

  async send(title: string, body: string): Promise<boolean> {
    if (!this.token || !this.chatId) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(this.token)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: `🧬 BioPulse\n<b>${title}</b>\n${body}`,
          parse_mode: "HTML",
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

class NtfyNotificationProvider implements NotificationProvider {
  constructor(private topic: string) {}

  async send(title: string, body: string): Promise<boolean> {
    if (!this.topic) return false;
    try {
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(this.topic)}`, {
        method: "POST",
        headers: {
          Title: title,
          Priority: "high",
          Tags: "alarm,bio,pulse",
        },
        body,
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export interface NotificationService {
  sendAlarm(alarm: Alarm): Promise<void>;
  sendBrowser(title: string, body: string): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  getPermission(): NotificationPermission | "unsupported";
}

class NotificationServiceImpl implements NotificationService {
  private browser: BrowserNotificationProvider;

  constructor() {
    this.browser = new BrowserNotificationProvider();
  }

  async sendAlarm(alarm: Alarm): Promise<void> {
    const title = alarm.priority === "high" ? "🚨 ALARM" : `⏰ ${alarm.label}`;
    const body = alarm.label;

    await this.browser.send(title, body);
  }

  async sendBrowser(title: string, body: string): Promise<boolean> {
    return this.browser.send(title, body);
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    return Notification.requestPermission();
  }

  getPermission(): NotificationPermission | "unsupported" {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  }
}

export const notificationService: NotificationService = new NotificationServiceImpl();
