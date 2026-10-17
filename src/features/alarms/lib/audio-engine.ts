import { customSoundId, getCustomSoundBlob, getCustomSoundBytes } from "./custom-sounds";

export type AlarmSoundName = "chime" | "digital" | "bio" | "study" | "romantic";

/** A built-in tone, or `custom:<soundId>` pointing at the user's own audio file. */
export type AlarmSound = AlarmSoundName | `custom:${string}`;

const DECODE_TIMEOUT_MS = 2500;

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

  /**
   * Called once the engine is actually producing sound.
   *
   * <p>The native side rings a fallback tone so an alarm is still audible when the WebView is gone.
   * This is how it learns that the page has taken over, so the two never sound at the same time.
   * A custom file reports late — after it has been decoded — which is the point: until then the
   * fallback is the only thing making noise.
   */
  onSoundStarted: (() => void) | null = null;

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
    this.reportSynthStarted();
  }

  /**
   * Reports that a built-in tone is audible — but only once it actually is.
   *
   * <p>The native side rings a fallback tone whenever the OS wakes the app for an alarm, and it
   * stands that tone down the moment this page reports that it has taken over. Reporting a tone
   * while the AudioContext is still suspended would therefore silence both sides at once: the
   * notification stays on screen with nothing behind it. So resume first, retry briefly, and only
   * report a running context — if it never runs, the native fallback simply keeps ringing.
   */
  private reportSynthStarted(attempt = 0): void {
    const token = this.token;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "running") {
      this.onSoundStarted?.();
      return;
    }
    try {
      void ctx.resume().catch(() => {});
    } catch {
      /* resume unavailable — the retry below still runs */
    }
    if (attempt >= 20) return;
    setTimeout(() => {
      if (token !== this.token) return;
      this.reportSynthStarted(attempt + 1);
    }, 400);
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

    // Tear the element down before releasing its URL. Revoking first left the element holding a
    // dead source, so the next attempt saw `networkState === NETWORK_NO_SOURCE` and refused to
    // load; and revoking while a `play()` was still starting aborted that play outright.
    if (this.mediaEl) {
      const el = this.mediaEl;
      try {
        el.onended = null;
        el.pause();
      } catch {
        /* element already torn down */
      }
      try {
        el.removeAttribute("src");
        el.load();
      } catch {
        /* nothing to clear */
      }
      this.mediaEl = null;
    }
    if (this.mediaUrl) {
      const url = this.mediaUrl;
      this.mediaUrl = null;
      // Defer revocation slightly. Revoking immediately while the element is still
      // attempting to load/play aborts the in-flight play() call (AbortError) and
      // leaves the element in NETWORK_NO_SOURCE on some WebViews.
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 500);
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

    // A decoded buffer gives gapless looping, but it is not dependable here: on this WebView
    // `decodeAudioData` on a ~4 MB file neither resolves nor rejects, so awaiting it left the
    // alarm waiting forever and silent. A plain <audio> element loads and plays the same files
    // straight away, so it goes first and decoding is only ever a bonus.
    const played = await this.startCustomViaMediaElement(id);
    if (token !== this.token) return;
    if (played) {
      this.onSoundStarted?.();
      return;
    }

    let buffer = this.bufferCache.get(id);
    if (!buffer) {
      let bytes: ArrayBuffer | null = null;
      try {
        bytes = await getCustomSoundBytes(id);
      } catch {
        bytes = null;
      }
      // The sound is gone from storage, or nothing on this device can play it. Ring the default
      // tone rather than leaving the alarm silent.
      if (!bytes || token !== this.token) {
        if (token === this.token) {
          this.startLoop("chime");
          this.reportSynthStarted();
        }
        return;
      }
      const decoded = await this.decodeWithTimeout(bytes, DECODE_TIMEOUT_MS);
      if (decoded) {
        buffer = decoded;
        this.bufferCache.set(id, decoded);
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
    this.onSoundStarted?.();
  }

  /**
 * Decodes with a deadline.
 *
 * <p>`decodeAudioData` is not guaranteed to settle: on the device this was built for, a ~4 MB file
 * produced a promise that neither resolved nor rejected, which left the alarm waiting on it
 * forever. A timeout keeps playback moving instead.
 */
  private async decodeWithTimeout(bytes: ArrayBuffer, ms: number): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    });
    try {
      const ctx = this.ctx;
      return await Promise.race([
        ctx.decodeAudioData(bytes).catch(() => null),
        timeout,
      ]);
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Foreground-only fallback for files the Web Audio decoder rejects. Returns whether it started. */
  private async startCustomViaMediaElement(id: string): Promise<boolean> {
    // A fresh element every time. Reusing one left it holding the previous, already-revoked URL,
    // and a WebView that will not load a second source into the same element reported
    // `NETWORK_NO_SOURCE` and played nothing at all.
    let el: HTMLAudioElement;
    try {
      el = new Audio();
    } catch {
      return false;
    }
    el.preload = "auto";
    el.loop = true;
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
    if (!url) return false;
    this.mediaEl = el;
    if (this.mediaUrl && this.mediaUrl !== url) {
      const old = this.mediaUrl;
      this.mediaUrl = url;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(old);
        } catch {}
      }, 500);
    } else {
      this.mediaUrl = url;
    }
    el.onended = () => {
      // Some WebViews drop `loop` on blob sources; re-arm defensively.
      if (el && el.paused === false) {
        el.play().catch(() => {});
      }
    };
    el.src = url;
    el.currentTime = 0;
    // `play()` rejects with AbortError when anything pauses the element while it is still starting
    // up, which happens easily when a playback request is issued twice in quick succession. One
    // retry separates the two without leaving the alarm silent.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await el.play();
        return true;
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name !== "AbortError" || attempt === 1) return false;
        await new Promise((r) => setTimeout(r, 120));
        if (el.paused) continue;
        return true;
      }
    }
    return false;
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
      case "study":
        this.playStudy();
        this.loopTimer = setTimeout(() => this.startLoop(name), this.studyLoopMs);
        break;
      case "romantic":
        this.playRomantic();
        this.loopTimer = setTimeout(() => this.startLoop(name), this.romanticLoopMs);
        break;
    }
  }

  /** Duck to `level` (0–1) so the spoken announcement can sit clearly on top, then restore. */
  setMusicLevel(level: number): void {
    if (this.masterGain) {
      try {
        this.masterGain.gain.setTargetAtTime(level, this.ctx!.currentTime, 0.08);
      } catch {
        this.masterGain.gain.value = level;
      }
    }
  }

  /* ---------- study: a calm, loopable piano lullaby (C major) ---------- */

  private readonly studyLoopMs = 16000;

  private playStudy(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const f = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const beat = 0.5; // 120 BPM, 2 bars per chord

    const chords: { bass: number; notes: number[] }[] = [
      { bass: 36, notes: [48, 55, 60, 64] }, // Cmaj7
      { bass: 33, notes: [45, 52, 57, 60] }, // Am7
      { bass: 29, notes: [41, 48, 53, 57] }, // Fmaj7
      { bass: 31, notes: [43, 50, 55, 59] }, // G6
    ];
    const phrase: [number, number, number][] = [
      [72, 0.0, 1.3],
      [71, 1.5, 1.2],
      [69, 3.0, 1.1],
      [72, 4.0, 1.2],
      [74, 5.6, 0.6],
      [72, 6.3, 1.1],
      [77, 8.0, 1.3],
      [72, 9.6, 0.8],
      [69, 11.0, 1.1],
      [67, 12.0, 1.2],
      [69, 13.4, 1.0],
      [71, 14.6, 1.2],
    ];

    const addNote = (t0: number, midi: number, dur: number, amp: number, decay: number) => {
      const f0 = f(midi);
      // A few soft partials mimic a piano's quick attack + ringing decay.
      ([[1, 1], [2, 0.45], [3, 0.2], [4, 0.07]] as const).forEach(([mult, level]) => {
        const osc = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        osc.type = "sine";
        osc.frequency.value = f0 * mult;
        const t = now + t0;
        const peak = amp * level;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + decay * 2.2);
        osc.connect(g);
        g.connect(this.masterGain!);
        osc.start(t);
        osc.stop(t + dur + decay * 2.2 + 0.05);
        this.activeOscillators.push(osc);
      });
    };

    const chordSec = 4;
    for (let ci = 0; ci < chords.length; ci++) {
      const tBase = ci * chordSec;
      const chord = chords[ci];
      addNote(tBase, chord.bass, 1.2, 0.11, 0.4);
      addNote(tBase + beat * 3, chord.bass, 1.2, 0.09, 0.4);
      const seq = [...chord.notes.map((n) => n + 12), chord.notes[0] + 24];
      for (let k = 0; k < 8; k++) {
        addNote(tBase + (k * beat) / 2, seq[k % seq.length], 0.8, 0.033, 0.3);
      }
    }
    for (const [midi, t0, dur] of phrase) {
      addNote(t0, midi, dur, 0.13, 0.75);
    }
  }

  /* ---------- romantic: a warm, slow loop (G - D/F# - Em7 - Cmaj7) ---------- */

  private readonly romanticLoopMs = 19200;

  private playRomantic(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const f = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const beat = 60 / 104; // 104 BPM, 2 bars per chord

    const chords: { bass: number; notes: number[] }[] = [
      { bass: 31, notes: [43, 50, 55, 59] }, // G
      { bass: 30, notes: [42, 50, 57, 62] }, // D/F#
      { bass: 28, notes: [40, 47, 52, 55] }, // Em7
      { bass: 24, notes: [36, 43, 48, 52] }, // Cmaj7
    ];
    const phrase: [number, number, number][] = [
      [71, 0.0, 1.5],
      [74, 1.9, 1.3],
      [71, 3.6, 1.2],
      [69, 4.8, 1.4],
      [66, 6.6, 1.1],
      [69, 7.9, 1.2],
      [72, 9.6, 1.5],
      [71, 11.4, 0.8],
      [69, 12.5, 1.3],
      [67, 14.4, 1.3],
      [64, 16.0, 1.4],
      [67, 17.6, 1.4],
    ];

    const addNote = (t0: number, midi: number, dur: number, amp: number, decay: number) => {
      const f0 = f(midi);
      ([[1, 1], [2, 0.45], [3, 0.2], [4, 0.07]] as const).forEach(([mult, level]) => {
        const osc = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        osc.type = "sine";
        osc.frequency.value = f0 * mult;
        const t = now + t0;
        const peak = amp * level;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + decay * 2.2);
        osc.connect(g);
        g.connect(this.masterGain!);
        osc.start(t);
        osc.stop(t + dur + decay * 2.2 + 0.05);
        this.activeOscillators.push(osc);
      });
    };

    const chordSec = 4.8;
    for (let ci = 0; ci < chords.length; ci++) {
      const tBase = ci * chordSec;
      const chord = chords[ci];
      addNote(tBase, chord.bass, 1.6, 0.09, 0.6);
      addNote(tBase + beat * 3, chord.bass, 1.6, 0.07, 0.6);
      const seq = [...chord.notes.map((n) => n + 12), chord.notes[0] + 24];
      for (let k = 0; k < 14; k++) {
        addNote(tBase + (k * beat) / 2, seq[k % seq.length], 1.0, 0.026, 0.4);
      }
    }
    for (const [midi, t0, dur] of phrase) {
      addNote(t0, midi, dur, 0.11, 0.85);
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
