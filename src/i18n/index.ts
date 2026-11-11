export type Locale = "en" | "si";

export const LOCALES: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: "en", label: "English", nativeLabel: "English" },
  { id: "si", label: "Sinhala", nativeLabel: "සිංහල" },
];

export function getLocale(id: Locale) {
  return LOCALES.find((l) => l.id === id) ?? LOCALES[0];
}
