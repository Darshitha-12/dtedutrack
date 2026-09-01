import { en } from "./en";
import { si } from "./si";
import type { Locale } from "./index";

type DeepStringRecord = { [key: string]: string | DeepStringRecord };

export const translations: Record<Locale, DeepStringRecord> = { en: en as DeepStringRecord, si: si as DeepStringRecord };

export function t(locale: Locale): typeof en {
  return (translations[locale] ?? translations.en) as typeof en;
}
