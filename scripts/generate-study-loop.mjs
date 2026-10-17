// Generates a calm, loopable piano study piece as a 16-bit PCM WAV.
// A simple C-major lullaby over Cmaj7 - Am7 - Fmaj7 - G6, gently arpeggiated,
// played with an additive "piano" timbre (fast attack, exponential decay).
// Deterministic: no RNG, no deps. Loops seamlessly at the sample level.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 44100;
const BPM = 120;
const BEAT = 60 / BPM; // 0.5s
const BAR = 4 * BEAT; // 2s
const CHORD_MS = 4000; // 2 bars per chord
const CYCLES = 2; // 4 chords × 4s × 2 = 32s seamless loop

const MIDI = (n) => 440 * 2 ** ((n - 69) / 12);

// bass midi + a warm voicing (midi) for each chord
const CHORDS = [
  { bass: 36, notes: [48, 55, 60, 64] }, // Cmaj7
  { bass: 33, notes: [45, 52, 57, 60] }, // Am7
  { bass: 29, notes: [41, 48, 53, 57] }, // Fmaj7
  { bass: 31, notes: [43, 50, 55, 59] }, // G6
];

// Melody phrase over one 16s cycle; repeated once for the 32s loop.
const PHRASE = [
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

const totalSamples = Math.round((CYCLES * CHORDS.length * CHORD_MS / 1000) * SAMPLE_RATE);
const data = new Float64Array(totalSamples);

function addNote(midi, t0, dur, amp, decayS, partials, phaseOffset = 0) {
  const f0 = MIDI(midi);
  const base = Math.max(8, Math.round(t0 * SAMPLE_RATE));
  const len = Math.min(
    totalSamples - base,
    Math.round((dur + decayS * 2.2) * SAMPLE_RATE)
  );
  if (len <= 0) return;
  // fast 2ms attack then exponential decay
  const attack = Math.round(0.002 * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    let env = Math.exp(-t / decayS);
    if (i < attack) env *= (i / attack) ** 2;
    for (const [mult, level, detune] of partials) {
      const s = Math.sin(2 * Math.PI * f0 * mult * (1 + detune) * t + phaseOffset);
      data[base + i] += amp * level * env * s;
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

    // bass: root, low octave, on each chord change (two soft hits)
    for (const hit of [0, BEAT * 3]) {
      addNote(chord.bass, tBase + hit, 1.2, 0.11, 0.5, PIANO_PARTIALS, ci * 0.4);
    }

    // gentle arpeggio: voicing + octave, eighth notes through the chord
    const seq = [...chord.notes.map((n) => n + 12), chord.notes[0] + 24];
    for (let k = 0; k < 8; k++) {
      const n = seq[k % seq.length];
      addNote(n, tBase + k * BEAT / 2, 0.8, 0.033, 0.28, PIANO_PARTIALS, (ci + k) * 0.21);
    }

    // melody
    const offset = cy * CHORDS.length * (CHORD_MS / 1000);
    for (const [midi, t0, dur] of PHRASE) {
      if (t0 >= tBase - offset && t0 < tBase + CHORD_MS / 1000) {
        addNote(midi, tBase + (t0 - (tBase - offset)), dur, 0.13, 0.75, PIANO_PARTIALS, midi * 0.017);
      }
    }
  }
}

// Normalise gently — a background music bed, not a loud track.
let peak = 0;
for (let i = 0; i < data.length; i++) {
  const v = Math.abs(data[i]);
  if (v > peak) peak = v;
}
const gain = 0.45 / (peak || 1);

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
writeWav(resolve(outDir, "bp_study_loop.wav"), pcm, SAMPLE_RATE);