"use client";

import * as React from "react";
import { translations, t as resolveDict } from "@/i18n/translations";
import type { Locale } from "@/i18n";

type DeepStringRecord = { [key: string]: string | DeepStringRecord };

const STORAGE_KEY = "biopulse-language";

function getByPath(dict: DeepStringRecord, path: string): string {
  const parts = path.split(".");
  let node: string | DeepStringRecord = dict;
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return path;
    }
    node = node[part];
  }
  return typeof node === "string" ? node : path;
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = params[key];
    return val != null ? String(val) : `{${key}}`;
  });
}

function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("en");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const stored = (() => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === "si" || v === "en" ? (v as Locale) : null;
      } catch {
        return null;
      }
    })();

    const apply = (l: Locale) => {
      if (cancelled) return;
      setLocaleState(l);
      setReady(true);
    };

    if (stored) {
      apply(stored);
      return;
    }

    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const l: Locale | undefined = data?.language;
        if (l === "si" || l === "en") apply(l);
        else apply("en");
      })
      .catch(() => apply("en"));
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = React.useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: l }),
    }).catch(() => {});
  }, []);

  const t = React.useCallback(
    (path: string, params?: Record<string, string | number>) => {
      const dict = translations[locale] ?? translations.en;
      return interpolate(getByPath(dict as DeepStringRecord, path), params);
    },
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

function useLanguage(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

function useT() {
  const { t } = useLanguage();
  return t;
}

export { LanguageProvider, useLanguage, useT };
export type { Locale };
export { resolveDict };
