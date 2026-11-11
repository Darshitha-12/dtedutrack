export interface Profile {
  name: string;
  examDate: string;
  targetGrade: string;
  revHours: number;
  dailyHr: number;
}

export const DEFAULT_PROFILE: Profile = {
  name: "Scholar",
  examDate: "",
  targetGrade: "A",
  revHours: 350,
  dailyHr: 4,
};

export interface TelegramSettings {
  enabled: boolean;
  token: string;
  chatId: string;
  all: boolean;
}

export interface NtfySettings {
  enabled: boolean;
  topic: string;
}

export interface HydrationSettings {
  enabled: boolean;
  every: number;
}

export interface AppSettings {
  sound: string;
  ttsOn: boolean;
  voiceName: string;
  rate: number;
  pitch: number;
  keepAlive: boolean;
  telegram: TelegramSettings;
  ntfy: NtfySettings;
  pomodoro: {
    study: number;
    break: number;
    longBreak: number;
    cycles: number;
  };
  hydration: HydrationSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: "chime",
  ttsOn: true,
  voiceName: "",
  rate: 1,
  pitch: 1,
  keepAlive: false,
  telegram: { enabled: false, token: "", chatId: "", all: false },
  ntfy: { enabled: false, topic: "" },
  pomodoro: { study: 50, break: 10, longBreak: 30, cycles: 4 },
  hydration: { enabled: true, every: 45 },
};

export interface AppState {
  profile: Profile;
  settings: AppSettings;
  _mut: number;
}
