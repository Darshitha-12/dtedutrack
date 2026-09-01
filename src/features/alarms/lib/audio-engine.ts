export type AlarmSoundName = "chime" | "digital" | "bio";

class AudioEngineClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private customSource: AudioBufferSourceNode | null = null;

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

  play(name: AlarmSoundName): void {
    this.stop();
    this.ensure();
    this.activeOscillators = [];
    this.startLoop(name);
  }

  playCustom(blob: Blob): void {
    this.stop();
    this.ensure();
    const reader = new FileReader();
    reader.onload = async () => {
      if (!this.ctx || !this.masterGain) return;
      try {
        const buffer = await this.ctx.decodeAudioData(reader.result as ArrayBuffer);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.masterGain);
        source.start();
        this.customSource = source;
      } catch {
        // decode error — silently ignore
      }
    };
    reader.readAsArrayBuffer(blob);
  }

  stop(): void {
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
    if (this.customSource) {
      try {
        this.customSource.stop();
      } catch {
        /* already stopped */
      }
      this.customSource = null;
    }
  }

  cue(_name: string): void {
    this.ensure();
    if (!this.ctx || !this.masterGain) return;
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
