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

    const voices = synth.getVoices();
    const preferred = voices.find((v) => v.lang === "en-US" && v.name.includes("Google")) ??
      voices.find((v) => v.lang === "en-US") ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];

    if (preferred) utterance.voice = preferred;
    synth.speak(utterance);
  }

  stop(): void {
    this.synthesis?.cancel();
  }
}

export const speechService: SpeechService = new WebSpeechProvider();
