import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rate = 22050;
const seconds = 1.2;
const numSamples = Math.floor(rate * seconds);
const samples = Buffer.alloc(numSamples * 2); // silence

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + samples.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(samples.length, 40);

const out = path.join(root, "android", "app", "src", "main", "res", "raw", "bp_silence_loop.wav");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, samples]));
console.log(`[silence-loop] -> ${out} (${Buffer.concat([header, samples]).length} bytes)`);