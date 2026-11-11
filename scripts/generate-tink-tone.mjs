// Generates a tiny, soft "tink" tone (a short damped bell) as a 16-bit PCM WAV.
// Single-shot, ~1.4s — the little sound the 12 AM daily notification makes.
// Deterministic, no deps. Writes android/app/src/main/res/raw/bp_tone_tink.wav
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 44100;
const DUR = 1.4;
const N = Math.round(SAMPLE_RATE * DUR);
const f = (m) => 440 * 2 ** ((m - 69) / 12);

const data = new Float64Array(N);
// Soft strike: fundamental (E6) + a couple of higher partials, fast decay, gentle dust-off.
const partials = [
  { m: 76, a: 0.35, d: 0.5 },
  { m: 88, a: 0.12, d: 0.22 },
  { m: 92, a: 0.06, d: 0.14 },
];
for (const { m, a, d } of partials) {
  const f0 = f(m);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    data[i] += a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f0 * t);
  }
}
// Attack ramp so there is no click; tail fade so it ends cleanly (loops aren't needed here).
for (let i = 0; i < N; i++) {
  const att = Math.min(1, i / (0.004 * SAMPLE_RATE));
  const fade = Math.min(1, (N - i) / (0.05 * SAMPLE_RATE));
  data[i] *= att * Math.max(0, fade);
}

const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, data[i]));
  pcm.writeInt16LE(Math.round(s * 32767 * 0.8), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const outDir = resolve(__dirname, "../android/app/src/main/res/raw");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "bp_tone_tink.wav");
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`wrote ${out} (${pcm.length + 44} bytes)`);