// Generates a short, bell-like "tri-tone" notification chime as a 16-bit PCM WAV.
const fs = require("fs");
const path = require("path");

const sr = 44100;
const dur = 0.65;
const n = Math.floor(sr * dur);
const notes = [
  { f: 1046.5, start: 0.0, amp: 0.85 },  // C6
  { f: 1318.51, start: 0.12, amp: 0.9 }, // E6
  { f: 1568.0, start: 0.24, amp: 1.0 },  // G6
];

function wave(f, x) {
  // A few harmonics give the metallic bell timbre of an iOS alert.
  return (
    0.72 * Math.sin(2 * Math.PI * f * x) +
    0.2 * Math.sin(2 * Math.PI * 2 * f * x) +
    0.08 * Math.sin(2 * Math.PI * 3 * f * x)
  );
}

const samples = new Float64Array(n);
for (let i = 0; i < n; i++) {
  const t = i / sr;
  let s = 0;
  for (const note of notes) {
    const x = t - note.start;
    if (x < 0) continue;
    const attack = Math.min(1, x / 0.004);
    const decay = Math.exp(-7 * x);
    s += note.amp * attack * decay * wave(note.f, x);
  }
  samples[i] = s;
}

let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
const scale = peak > 0 ? 0.86 / peak : 1;

const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  let v = Math.round(samples[i] * scale * 32767);
  v = Math.max(-32768, Math.min(32767, v));
  data.writeInt16LE(v, i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(sr, 24);
header.writeUInt32LE(sr * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "res",
  "raw",
  "bp_tone_ios.wav",
);
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log("wrote", out, header.length + data.length, "bytes");
