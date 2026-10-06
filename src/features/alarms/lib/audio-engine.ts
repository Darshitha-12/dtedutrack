import { customSoundId, getCustomSoundBlob, getCustomSoundBytes } from "./custom-sounds";

export type AlarmSoundName = "chime" | "digital" | "bio";

/** A built-in tone, or `custom:<soundId>` pointing at the user's own audio file. */
export type AlarmSound = AlarmSoundName | `custom:${string}`;

class AudioEngineClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaEl: HTMLAudioElement | null = null;
  private mediaUrl: string | null = null;
  /**
   * Custom sounds are played through Web Audio rather than an <audio> element.
   *
   * Measured on the Galaxy A01 Core (Android 10, WebView 156): once the activity is stopped the
   * page becomes hidden, and Chromium then freezes every media element — a paused-and-resumed
   * <audio> element never advances and `play()` never settles. The AudioContext keeps running, so
   * an alarm that fires while the phone is locked has to be synthesised by Web Audio to be heard
   * at all. Built-in tones already used this path; custom files now share it.
   */
  private bufferSource: AudioBufferSourceNode | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  // Only ever set for the media-element fallback, and owned by this class alone. Decoding uses raw
  // bytes so no shared/cached object URL is involved.
  private bufferUrl: string | null = null;
  /** Guards against a slow IndexedDB fetch starting playback after stop(). */
  private token = 0;

  ensure(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  play(name: AlarmSound): void {
    this.stop();
    this.ensure();
    this.activeOscillators = [];

    const customId = customSoundId(name);
    if (customId) {
      void this.startCustom(customId);
      return;
    }
    this.startLoop(name as AlarmSoundName);
  }

  /**
 * Plays a short sample of a sound, then stops on its own.
 *
 * <p>Used by the sound picker so picking a sound is heard immediately rather than only at the next
 * alarm. Built-in sounds stop early — they loop forever otherwise — while a custom file is left to
 * run a little longer, since it is the thing a user is trying to identify by ear.
 */
  preview(name: AlarmSound, ms = 2500): void {
    const customId = customSoundId(name);
    this.play(name);
    if (this.previewTimer !== null) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      this.stop();
    }, customId ? Math.max(ms, 6000) : ms);
  }

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  stop(): void {
    this.token += 1;
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.activeOscillators = [];

    if (this.bufferSource) {
      try {
        this.bufferSource.onended = null;
        this.bufferSource.stop();
      } catch {
        /* already stopped */
      }
      this.bufferSource = null;
    }
    // The decoded AudioBuffer outlives the object URL, so the URL is released as soon as it has
    // been read. Previously stop() revoked the URL that playback was still using, which meant a
    // custom sound could only ever be heard once.
    if (this.bufferUrl) {
      URL.revokeObjectURL(this.bufferUrl);
      this.bufferUrl = null;
    }

    if (this.mediaEl) {
      const el = this.mediaEl;
      try {
        el.onended = null;
        el.pause();
        el.currentTime = 0;
        el.removeAttribute("src");
        el.load();
      } catch {
        /* element already torn down */
      }
      this.mediaEl = null;
    }
    if (this.mediaUrl) {
      URL.revokeObjectURL(this.mediaUrl);
      this.mediaUrl = null;
    }
  }

  /** True while a synth tone or a custom file is sounding. */
  get isPlaying(): boolean {
    return this.activeOscillators.length > 0 || this.bufferSource !== null || this.mediaEl !== null;
  }

  /* ---------- user-supplied audio file ---------- */

  private async startCustom(id: string): Promise<void> {
    const token = ++this.token;
    this.ensure();

    let buffer = this.bufferCache.get(id);
    if (!buffer) {
      // Decode straight from the stored bytes. An object URL was used here before, and it was
      // revoked as soon as decoding finished — but the same URL is cached and shared with
      // <audio> elements, so the second playback onwards was handed dead bytes and went silent.
      let bytes: ArrayBuffer | null = null;
      try {
        bytes = await getCustomSoundBytes(id);
      } catch {
        bytes = null;
      }
      if (!bytes || token !== this.token) return;

      try {
        buffer = await this.ctx!.decodeAudioData(bytes);
        this.bufferCache.set(id, buffer);
      } catch {
        // A codec WebView cannot decode, or the file is gone. Fall back to a media element so the
        // alarm is still audible while the app is in the foreground.
        if (token === this.token) await this.startCustomViaMediaElement(id);
        return;
      }
    }
    if (!buffer || token !== this.token || !this.ctx || !this.masterGain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.masterGain);
    source.onended = () => {
      // Some WebViews drop `loop` on decoded buffers; re-arm defensively.
      if (token === this.token) {
        try {
          source.start();
        } catch {
          /* ignore */
        }
      }
    };
    source.start();
    this.bufferSource = source;
  }

  /** Foreground-only fallback for files the Web Audio decoder rejects. */
  private async startCustomViaMediaElement(id: string): Promise<void> {
    // Reuse a live element so rapid snooze/dismiss cycles do not leak nodes.
    let el = this.mediaEl;
    if (!el) {
      try {
        el = new Audio();
      } catch {
        return;
      }
      el.preload = "auto";
      el.loop = true;
      this.mediaEl = el;
    }
    // Build a URL the engine owns outright. Revoking the shared cached URL here raced the
    // element's own load and left it pointing at nothing, which is why this fallback was always
    // silent too.
    let url: string | null = null;
    try {
      const blob = await getCustomSoundBlob(id);
      if (blob) url = URL.createObjectURL(blob);
    } catch {
      url = null;
    }
    if (!url) return;
    if (this.mediaUrl && this.mediaUrl !== url) URL.revokeObjectURL(this.mediaUrl);
    this.mediaUrl = url;
    el.onended = () => {
      // Some WebViews drop `loop` on blob sources; re-arm defensively.
      if (el && el.paused === false) {
        el.play().catch(() => {});
      }
    };
    el.src = url;
    el.currentTime = 0;
    try {
      await el.play();
    } catch {
      // Autoplay blocked before the first user gesture — the next test starts it.
    }
  }

  cue(name: string): void {
    this.ensure();
    if (!this.ctx || !this.masterGain) return;
    if (name === "message") {
      // Two-tone "message received" blip: 987 Hz then 1318 Hz.
      const now = this.ctx.currentTime;
      const tone = (freq: number, at: number, dur: number) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.01, at);
        gain.gain.linearRampToValueAtTime(0.35, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(at);
        osc.stop(at + dur + 0.02);
        this.activeOscillators.push(osc);
      };
      tone(987, now, 0.16);
      tone(1318, now + 0.16, 0.2);
      return;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  /* ---------- internal looping ---------- */

  private startLoop(name: AlarmSoundName): void {
    switch (name) {
      case "chime":
        this.playChime();
        this.loopTimer = setTimeout(() => this.startLoop(name), 4500);
        break;
      case "digital":
        this.playDigital();
        this.loopTimer = setTimeout(() => this.startLoop(name), 3500);
        break;
      case "bio":
        this.playBio();
        this.loopTimer = setTimeout(() => this.startLoop(name), 4000);
        break;
    }
  }

  /* ---------- chime: sine arpeggio ---------- */

  private playChime(): void {
    if (!this.ctx || !this.masterGain) return;
    const freqs = [659.25, 830.61, 987.77, 1318.51];
    const now = this.ctx.currentTime;

    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i);
      gain.gain.linearRampToValueAtTime(0.35, now + i + 0.05);
      gain.gain.setValueAtTime(0.35, now + i + 0.7);
      gain.gain.linearRampToValueAtTime(0, now + i + 1);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i);
      osc.stop(now + i + 1.01);
      this.activeOscillators.push(osc);
    });
  }

  /* ---------- digital: square beeps + sustain ---------- */

  private playDigital(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 5 rapid beeps at 1245 Hz
    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1245;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.setValueAtTime(0, now + i * 0.15 + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.09);
      this.activeOscillators.push(osc);
    }

    // Sustain at 620 Hz
    const sustain = this.ctx.createOscillator();
    const sustainGain = this.ctx.createGain();
    sustain.type = "square";
    sustain.frequency.value = 620;
    sustainGain.gain.setValueAtTime(0.25, now + 0.8);
    sustainGain.gain.linearRampToValueAtTime(0, now + 2.5);
    sustain.connect(sustainGain);
    sustainGain.connect(this.masterGain);
    sustain.start(now + 0.8);
    sustain.stop(now + 2.51);
    this.activeOscillators.push(sustain);
  }

  /* ---------- bio: sawtooth sweep + bass hit ---------- */

  private playBio(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Sawtooth sweep 420 → 1500 → 430 Hz
    const sweep = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(420, now);
    sweep.frequency.linearRampToValueAtTime(1500, now + 1.5);
    sweep.frequency.linearRampToValueAtTime(430, now + 3);
    sweepGain.gain.setValueAtTime(0.25, now);
    sweepGain.gain.linearRampToValueAtTime(0, now + 3);
    sweep.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweep.start(now);
    sweep.stop(now + 3.01);
    this.activeOscillators.push(sweep);

    // Bass hit at 75 Hz
    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = "sine";
    bass.frequency.value = 75;
    bassGain.gain.setValueAtTime(0.5, now);
    bassGain.gain.linearRampToValueAtTime(0, now + 0.5);
    bass.connect(bassGain);
    bassGain.connect(this.masterGain);
    bass.start(now);
    bass.stop(now + 0.51);
    this.activeOscillators.push(bass);
  }
}

export const AudioEngine = new AudioEngineClass();
