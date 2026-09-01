import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

// Minimal PNG encoder (RGBA) using node:zlib
const ZLIB_OPTS = { level: 9 };

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, ZLIB_OPTS);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Helper to render the icon into an RGBA buffer
function renderIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const rOut = size * 0.48; // outer circle
  const bg = [3, 15, 12, 255]; // brand dark teal
  const ring = [74, 222, 128, 255]; // mint/green
  const accent = [45, 212, 191, 255]; // teal accent

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let [r, g, b, a] = bg;
      if (d <= rOut) {
        // ring
        if (d > rOut * 0.72 && d <= rOut * 0.82) {
          r = ring[0]; g = ring[1]; b = ring[2]; a = 255;
        } else if (d <= rOut * 0.55) {
          r = accent[0]; g = accent[1]; b = accent[2]; a = 255;
        }
        // simple "DNA" cross bars/spiral hints
        const ang = Math.atan2(dy, dx);
        const bar = Math.sin(ang * 4) * rOut * 0.22;
        if (Math.abs(d - rOut * 0.3) < size * 0.02 && Math.abs(dy) < size * 0.05) {
          r = 255; g = 255; b = 255; a = 255;
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const outDir = path.resolve("public");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [512, 192]) {
  const rgba = renderIcon(size);
  const png = encodePng(size, size, rgba);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`Wrote public/icon-${size}.png (${png.length} bytes)`);
}

// Also a small apple-touch-icon
const rgba180 = renderIcon(180);
const png180 = encodePng(180, 180, rgba180);
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), png180);
console.log(`Wrote public/apple-touch-icon.png (${png180.length} bytes)`);
