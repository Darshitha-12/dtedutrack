#!/usr/bin/env node
/**
 * Generates the alarm tones bundled into the APK (android/app/src/main/res/raw/*.wav).
 *
 * The native alarm player needs real files: it cannot run the Web Audio synthesis the page
 * uses, and it must not depend on system ringtone URIs (which vary per ROM and may be
 * unreadable). These WAVs replicate the built-in tones from
 * src/features/alarms/lib/audio-engine.ts so an alarm rings with the *selected* sound even
 * when the app is closed, plus one generic fallback tone.
 *
 * Run: node scripts/gen-alarm-tone.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "android", "app", "src", "main", "res", "raw");

const RATE = 22050;

function writeWav(name, seconds, sampleAt) {
  const N = Math.round(RATE * seconds);
  const buf = Buffer.alloc(44 + N * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + N * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, sampleAt(i / RATE)));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Attack/release envelope matching the ramps used by the Web Audio engine. */
const env = (t, dur, attack, release) =>
  clamp01(Math.min(t / attack, (dur - t) / release));

/* ---- generic fallback: two-tone "wake up" pattern ---- */
writeWav("bp_alarm_tone.wav", 2.0, (t) => {
  const beeps = [
    [988, 0.16],
    [740, 0.16],
    [988, 0.16],
    [740, 0.42],
  ];
  let cursor = 0.04;
  for (const [freq, dur] of beeps) {
    if (t >= cursor && t < cursor + dur) {
      return Math.sin(2 * Math.PI * freq * (t - cursor)) * 0.7 * env(t - cursor, dur, 0.01, 0.02);
    }
    cursor += dur + 0.1;
  }
  return 0;
});

/* ---- chime: four-note sine arpeggio (audio-engine.ts: playChime) ---- */
writeWav("bp_tone_chime.wav", 4.5, (t) => {
  const freqs = [659.25, 830.61, 987.77, 1318.51];
  let out = 0;
  freqs.forEach((freq, i) => {
    const start = i;
    const dur = 1;
    if (t >= start && t < start + dur) {
      out += Math.sin(2 * Math.PI * freq * (t - start)) * 0.35 * env(t - start, dur, 0.05, 0.3);
    }
  });
  return out;
});

/* ---- digital: rapid square beeps + sustained buzz (audio-engine.ts: playDigital) ---- */
writeWav("bp_tone_digital.wav", 3.5, (t) => {
  let out = 0;
  for (let i = 0; i < 5; i++) {
    const start = i * 0.15;
    const dur = 0.08;
    if (t >= start && t < start + dur) {
      out += Math.sign(Math.sin(2 * Math.PI * 1245 * (t - start))) * 0.3;
    }
  }
  const sustainStart = 0.8;
  const sustainDur = 1.7;
  if (t >= sustainStart && t < sustainStart + sustainDur) {
    out +=
      Math.sign(Math.sin(2 * Math.PI * 620 * (t - sustainStart))) *
      0.25 *
      env(t - sustainStart, sustainDur, 0.05, 0.3);
  }
  return out;
});

/* ---- bio: sawtooth sweep + bass hit (audio-engine.ts: playBio) ---- */
let bioPhase = 0; // writeWav walks samples in order, so a running phase is safe here
writeWav("bp_tone_bio.wav", 4.0, (t) => {
  let out = 0;
  if (t <= 3) {
    // Sweep 420 → 1500 → 430 Hz via a running phase (frequency itself is modulated).
    const freq = t <= 1.5 ? 420 + ((1500 - 420) * t) / 1.5 : 1500 + ((430 - 1500) * (t - 1.5)) / 1.5;
    bioPhase += (2 * Math.PI * freq) / RATE;
    const saw = (2 * ((bioPhase / (2 * Math.PI)) % 1)) - 1;
    out += saw * 0.25 * clamp01(1 - t / 3);
  }
  if (t <= 0.5) {
    out += Math.sin(2 * Math.PI * 75 * t) * 0.5 * env(t, 0.5, 0.05, 0.45);
  }
  return out;
});
