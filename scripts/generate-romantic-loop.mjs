// Generates a warm, romantic-sounding piano loop (G - D/F# - Em7 - Cmaj7) as
// a 16-bit PCM WAV. Same additive "piano" timbre as the study track but a slower,
// warmer feel. Deterministic, no RNG, no deps. Loops seamlessly at the sample level.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 44100;
const BPM = 104;
const BEAT = 60 / BPM;
const CHORD_MS = 4800; // 2 bars per chord
const CYCLES = 1; // 4 chords × 4.8s = 19.2s seamless loop

const MIDI = (n) => 440 * 2 ** ((n - 69) / 12);

const CHORDS = [
  { bass: 31, notes: [43, 50, 55, 59] }, // G: G2 D3 G3 B3
  { bass: 30, notes: [42, 50, 57, 62] }, // D/F#: F#2 D3 A3 D4
  { bass: 28, notes: [40, 47, 52, 55] }, // Em7: E2 B2 E3 G3
  { bass: 24, notes: [36, 43, 48, 52] }, // Cmaj7: C2 G2 C3 E3
];

// Melody phrase over one 19.2s cycle; repeated for the loop.
const PHRASE = [
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

const totalSamples = Math.round((CYCLES * CHORDS.length * CHORD_MS / 1000) * SAMPLE_RATE);
const data = new Float64Array(totalSamples);

function addNote(midi, t0, dur, amp, decayS, partials, phaseOffset = 0) {
  const f0 = MIDI(midi);
  const base = Math.max(8, Math.round(t0 * SAMPLE_RATE));
  const len = Math.min(totalSamples - base, Math.round((dur + decayS * 2.2) * SAMPLE_RATE));
  if (len <= 0) return;
  const attack = Math.round(0.003 * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    let env = Math.exp(-t / decayS);
    if (i < attack) env *= (i / attack) ** 2;
    for (const [mult, level, detune] of partials) {
      data[base + i] += amp * level * env * Math.sin(2 * Math.PI * f0 * mult * (1 + detune) * t + phaseOffset);
    }
  }
}

const PIANO_PARTIALS = [
  [1, 1.0, 0],
  [2, 0.45, 0.0006],
  [3, 0.2, 0.0012],
  [4, 0.07, 0.0018],
];

for (let cy = 0; cy < CYCLES; cy++) {
  for (let ci = 0; ci < CHORDS.length; ci++) {
    const chord = CHORDS[ci];
    const tBase = (cy * CHORDS.length + ci) * (CHORD_MS / 1000);

    // rolling bass: root on beat 0, fifth on beat 3 of each bar
    for (const hit of [0, 3]) {
      addNote(hit === 0 ? chord.bass : chord.bass - 7, tBase + hit * BEAT, 1.6, 0.09, 0.6, PIANO_PARTIALS, ci * 0.4);
    }

    // slow broken arpeggio (eighth notes, softer than study)
    const seq = [...chord.notes.map((n) => n + 12), chord.notes[0] + 24];
    for (let k = 0; k < 14; k++) {
      const n = seq[k % seq.length];
      addNote(n, tBase + k * BEAT / 2, 1.0, 0.026, 0.4, PIANO_PARTIALS, (ci * 8 + k) * 0.19);
    }

    // melody
    const offset = cy * CHORDS.length * (CHORD_MS / 1000);
    for (const [midi, t0, dur] of PHRASE) {
      const rel = t0 - (tBase - offset);
      if (rel >= -0.001 && rel < CHORD_MS / 1000) {
        addNote(midi, tBase + rel, dur, 0.11, 0.85, PIANO_PARTIALS, midi * 0.017);
      }
    }
  }
}

let peak = 0;
for (let i = 0; i < data.length; i++) {
  const v = Math.abs(data[i]);
  if (v > peak) peak = v;
}
const gain = 0.42 / (peak || 1);

const pcm = Buffer.alloc(data.length * 2);
for (let i = 0; i < data.length; i++) {
  let s = Math.max(-1, Math.min(1, data[i] * gain));
  s = Math.sign(s) * (1 - Math.exp(-Math.abs(s) * 3.4));
  pcm.writeInt16LE(Math.round(s * 32767), i * 2);
}

function writeWav(path, pcmBytes, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes.length, 40);
  writeFileSync(path, Buffer.concat([header, pcmBytes]));
  console.log(`wrote ${path} (${pcmBytes.length + 44} bytes)`);
}

const outDir = resolve(__dirname, "../android/app/src/main/res/raw");
mkdirSync(outDir, { recursive: true });
writeWav(resolve(outDir, "bp_romantic_loop.wav"), pcm, SAMPLE_RATE);