import type { AppState, AppSettings, Profile } from "@/types/settings";
import { DEFAULT_SETTINGS, DEFAULT_PROFILE } from "@/types/settings";

const STORAGE_KEY = "biopulse_v2";

function getDefaultState(): AppState {
  return {
    profile: { ...DEFAULT_PROFILE },
    settings: { ...DEFAULT_SETTINGS },
    _mut: Date.now(),
  };
}

export interface StorageProvider {
  load(): AppState;
  save(state: AppState): void;
  clear(): void;
}

class LocalStorageProvider implements StorageProvider {
  load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultState(),
        ...parsed,
        profile: { ...DEFAULT_PROFILE, ...parsed.profile },
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
          telegram: { ...DEFAULT_SETTINGS.telegram, ...parsed.settings?.telegram },
          ntfy: { ...DEFAULT_SETTINGS.ntfy, ...parsed.settings?.ntfy },
          pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...parsed.settings?.pomodoro },
          hydration: { ...DEFAULT_SETTINGS.hydration, ...parsed.settings?.hydration },
        },
      };
    } catch {
      return getDefaultState();
    }
  }

  save(state: AppState): void {
    try {
      state._mut = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      console.warn("Failed to save state to localStorage");
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export const storage: StorageProvider = new LocalStorageProvider();
