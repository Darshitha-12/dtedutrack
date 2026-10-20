export interface SpeechService {
  speak(text: string, options?: { force?: boolean }): void;
  stop(): void;
  isSupported(): boolean;
}

class WebSpeechProvider implements SpeechService {
  private get synthesis(): SpeechSynthesis | null {
    if (typeof window === "undefined") return null;
    return window.speechSynthesis ?? null;
  }

  isSupported(): boolean {
    return this.synthesis !== null;
  }

  speak(text: string, options?: { force?: boolean }): void {
    const synth = this.synthesis;
    if (!synth) return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Sinhala labels must go to a Sinhala voice — handing them to the default
    // en-US voice produced garbled pronunciation instead of the announcement.
    const sinhala = /[\u0D80-\u0DFF]/.test(text);
    const voices = synth.getVoices();
    const preferred = sinhala
      ? voices.find((v) => v.lang.toLowerCase().startsWith("si")) ??
        voices.find((v) => v.name.toLowerCase().includes("sinhala")) ??
        voices[0]
      : voices.find((v) => v.lang === "en-US" && v.name.includes("Google")) ??
        voices.find((v) => v.lang === "en-US") ??
        voices.find((v) => v.lang.startsWith("en")) ??
        voices[0];

    if (preferred) utterance.voice = preferred;
    // Fall back to a language hint when no voice object exists yet (voices load
    // asynchronously in some engines) so the engine can still pick a speaker.
    utterance.lang = preferred?.lang ?? (sinhala ? "si-LK" : "en-US");
    synth.speak(utterance);
  }

  stop(): void {
    this.synthesis?.cancel();
  }
}

export const speechService: SpeechService = new WebSpeechProvider();
