import { Buffer } from "buffer";

const g = globalThis;
const prow = g.crypto;

function buf(data) {
  return typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
}

function rotl(x, n) {
  return (x << n) | (x >>> (32 - n));
}

/* ---------------- SHA-1 ---------------- */
export function sha1(data) {
  const msg = buf(data);
  const ml = msg.length * 8;
  let buffer = new Uint8Array(Array.from(msg));
  const rem = (buffer.length + 8) % 64;
  const pad = rem === 0 ? 0 : 64 - rem;
  const padded = new Uint8Array(buffer.length + pad + 8);
  padded.set(buffer);
  padded[buffer.length] = 0x80;
  let h = new DataView(new ArrayBuffer(8));
  h.setUint32(0, Math.floor(ml / 0x100000000));
  h.setUint32(4, ml >>> 0);
  padded.set(new Uint8Array(h.buffer), padded.length - 8);
  const words = new Uint8Array(padded.buffer);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const blk = new Uint8Array(64);
  const w = new Uint32Array(80);
  const dv = new DataView(words.buffer, words.byteOffset, words.byteLength);
  for (let off = 0; off < words.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = rotl(n, 1);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0); odv.setUint32(4, h1); odv.setUint32(8, h2); odv.setUint32(12, h3); odv.setUint32(16, h4);
  return Buffer.from(out);
}

/* ---------------- SHA-256 ---------------- */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function sha256Raw(bytes) {
  const msg = buf(bytes);
  const ml = msg.length * 8;
  const rem = (msg.length + 8) % 64;
  const pad = rem === 0 ? 0 : 64 - rem;
  const padded = new Uint8Array(msg.length + pad + 8);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const h = new DataView(new ArrayBuffer(8));
  h.setUint32(0, Math.floor(ml / 0x100000000));
  h.setUint32(4, ml >>> 0);
  padded.set(new Uint8Array(h.buffer), padded.length - 8);
  const dv = new DataView(padded.buffer);
  const w = new Uint32Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotl(w[i - 15], 25) ^ rotl(w[i - 15], 14) ^ (w[i - 15] >>> 3));
      const s1 = (rotl(w[i - 2], 15) ^ rotl(w[i - 2], 13) ^ (w[i - 2] >>> 10));
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotl(e, 26) ^ rotl(e, 21) ^ rotl(e, 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = (rotl(a, 30) ^ rotl(a, 19) ^ rotl(a, 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0); odv.setUint32(4, h1); odv.setUint32(8, h2); odv.setUint32(12, h3);
  odv.setUint32(16, h4); odv.setUint32(20, h5); odv.setUint32(24, h6); odv.setUint32(28, h7);
  return Buffer.from(out);
}
export { sha256Raw as sha256 };

/* ---------------- SHA-512 (BigInt) ---------------- */
const K512 = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];
function sha512Raw(bytes) {
  const msg = buf(bytes);
  const ml = BigInt(msg.length * 8);
  const rem = (msg.length + 16) % 128;
  const pad = rem === 0 ? 0 : 128 - rem;
  const padded = new Uint8Array(msg.length + pad + 16);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const hi = new DataView(new ArrayBuffer(8));
  hi.setUint32(0, Math.floor(msg.length * 8 / 0x100000000));
  hi.setUint32(4, (msg.length * 8) >>> 0);
  padded.set(new Uint8Array(hi.buffer), padded.length - 8);
  const dv = new DataView(padded.buffer);
  const w = new Array(80);
  let h0 = 0x6a09e667f3bcc908n, h1 = 0xbb67ae8584caa73bn, h2 = 0x3c6ef372fe94f82bn,
      h3 = 0xa54ff53a5f1d36f1n, h4 = 0x510e527fade682d1n, h5 = 0x9b05688c2b3e6c1fn,
      h6 = 0x1f83d9abfb41bd6bn, h7 = 0x5be0cd19137e2179n;
  const M = (x) => x & 0xFFFFFFFFFFFFFFFFn;
  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 16; i++) {
      const hiW = BigInt(dv.getUint32(off + i * 8));
      const loW = BigInt(dv.getUint32(off + i * 8 + 4));
      w[i] = (hiW << 32n) | loW;
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >> 1n) | (x << 63n)) ^ ((x >> 8n) | (x << 56n)) ^ (x >> 7n);
      const s1 = ((y >> 19n) | (y << 45n)) ^ ((y >> 61n) | (y << 3n)) ^ (y >> 6n);
      w[i] = M(w[i - 16] + s0 + w[i - 7] + s1);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 80; i++) {
      const S1 = ((e >> 14n) | (e << 50n)) ^ ((e >> 18n) | (e << 46n)) ^ ((e >> 41n) | (e << 23n));
      const ch = (e & f) ^ (~e & g);
      const t1 = M(hh + S1 + ch + K512[i] + w[i]);
      const S0 = ((a >> 28n) | (a << 36n)) ^ ((a >> 34n) | (a << 30n)) ^ ((a >> 39n) | (a << 25n));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = M(S0 + maj);
      hh = g; g = f; f = e; e = M(d + t1); d = c; c = b; b = a; a = M(t1 + t2);
    }
    h0 = M(h0 + a); h1 = M(h1 + b); h2 = M(h2 + c); h3 = M(h3 + d);
    h4 = M(h4 + e); h5 = M(h5 + f); h6 = M(h6 + g); h7 = M(h7 + hh);
  }
  const out = new Uint8Array(64);
  const odv = new DataView(out.buffer);
  const put = (idx, v) => { odv.setUint32(idx, Number(v >> 32n)); odv.setUint32(idx + 4, Number(v & 0xFFFFFFFFn)); };
  put(0, h0); put(8, h1); put(16, h2); put(24, h3); put(32, h4); put(40, h5); put(48, h6); put(56, h7);
  return Buffer.from(out);
}
export { sha512Raw as sha512 };

/* ---------------- HMAC ---------------- */
const hashFns = { "sha1": sha1, "sha256": sha256Raw, "sha512": sha512Raw };
function hmac (data, key, digest) {
  const hashFn = hashFns[digest];
  const blockSize = digest === "sha512" ? 128 : 64;
  let k = buf(key);
  if (k.length > blockSize) k = hashFn(k);
  const opad = new Uint8Array(blockSize).fill(0x5c);
  const ipad = new Uint8Array(blockSize).fill(0x36);
  for (let i = 0; i < k.length; i++) { opad[i] ^= k[i]; ipad[i] ^= k[i]; }
  const inner = hashFn(Buffer.concat([Buffer.from(ipad), buf(data)]));
  return hashFn(Buffer.concat([Buffer.from(opad), inner]));
}

/* ---------------- Hashing object API ---------------- */
class Hash {
  constructor(digest) { this.digestName = digest; this.parts = []; }
  update(chunk) { this.parts.push(buf(chunk)); return this; }
  digest(enc) {
    const hf = hashFns[this.digestName];
    const out = hf(Buffer.concat(this.parts));
    return enc === "hex" ? out.toString("hex") : out;
  }
}

/* ---------------- PBKDF2 ---------------- */
function pbkdf2Sync(password, salt, iterations, keylen, digest) {
  digest = digest || "sha1";
  const saltB = buf(salt);
  const inner = (p, s) => hmac(s, p, digest);
  const blocks = Math.ceil(keylen / hashFns[digest](Buffer.alloc(0)).length);
  const out = [];
  for (let bi = 1; bi <= blocks; bi++) {
    const block = new Uint8Array(saltB.length + 4);
    block.set(saltB);
    block[saltB.length] = (bi >>> 24) & 0xff;
    block[saltB.length + 1] = (bi >>> 16) & 0xff;
    block[saltB.length + 2] = (bi >>> 8) & 0xff;
    block[saltB.length + 3] = bi & 0xff;
    let u = buf(hmac(block, password, digest));
    let t = Buffer.from(u);
    for (let i = 2; i <= iterations; i++) {
      u = buf(hmac(u, password, digest));
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    out.push(t);
  }
  return Buffer.concat(out).slice(0, keylen);
}

/* ---------------- misc ---------------- */
function randomBytes(count) {
  const out = Buffer.alloc(count);
  const dv = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  if (prow && typeof prow.getRandomValues === "function") {
    const chunk = 65536;
    for (let off = 0; off < dv.length; off += chunk) {
      prow.getRandomValues(dv.subarray(off, Math.min(off + chunk, dv.length)));
    }
    return out;
  }
  throw new Error("crypto.getRandomValues unavailable");
}
function getRandomValues(arr) { return prow ? prow.getRandomValues(arr) : null; }
function createCipheriv() { throw new Error("crypto.createCipheriv not available in browser"); }
function createDecipheriv() { throw new Error("crypto.createDecipheriv not available in browser"); }

class Hmac {
  constructor(key, digest) { this.key = buf(key); this.digestName = digest; this.parts = []; }
  update(chunk) { this.parts.push(buf(chunk)); return this; }
  digest(enc) {
    const out = hmac(Buffer.concat(this.parts), this.key, this.digestName);
    return enc === "hex" ? out.toString("hex") : out;
  }
}

const subtle = prow && prow.subtle;

const createHash = (d) => new Hash(d);
const createHmac = (d, key) => new Hmac(key, d);

export {
  createHash,
  createHmac,
  randomBytes,
  getRandomValues,
  createCipheriv,
  createDecipheriv,
  subtle,
  pbkdf2Sync,
};

export default {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  getRandomValues,
  subtle,
  pbkdf2Sync,
};