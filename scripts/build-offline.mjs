/**
 * Builds the fully offline Android web bundle.
 *
 *   node scripts/build-offline.mjs [--skip-dump] [--skip-sync]
 *
 * What it does:
 *   1. Dumps the syllabus + question bank out of the database (public/offline/content.json)
 *      and writes src/generated/offline-manifest.json for generateStaticParams.
 *   2. Stashes everything that cannot exist in a static export:
 *        src/app/api/**   (all server routes — the offline shim answers them instead)
 *        middleware.ts    (NextAuth — no server offline)
 *        AI pages         (ai-tutor, diagrams, ai-timetable — removed per product decision)
 *   3. Runs `next build` with OFFLINE_BUILD=1 → static export into out/
 *   4. Restores the stash (always, even on failure).
 *   5. Syncs the export into the Capacitor Android project with server.url stripped so
 *      the APK boots from bundled assets with no network at all.
 *
 * The repo is left exactly as it was found (the online Vercel build is unaffected).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { checkBridgeMethods } from "./check-bridge-methods.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stashDir = path.join(root, ".offline-stash");
const skipDump = process.argv.includes("--skip-dump");
const skipSync = process.argv.includes("--skip-sync");
const skipVendor = process.argv.includes("--skip-vendor");

// Fail fast when a @JavascriptInterface method sits outside the class registered with
// addJavascriptInterface — it would compile fine but be invisible to the page, which is
// exactly how custom alarm sounds silently fell back to the system ringtone.
const bridgeProblems = checkBridgeMethods(
  path.join(root, "android", "app", "src", "main", "java", "com", "biopulse", "app", "MainActivity.java"),
);
if (bridgeProblems.length) {
  console.error("[build-offline] bridge interface check FAILED:");
  for (const p of bridgeProblems) console.error("  - " + p);
  process.exit(1);
}

const STASH_ITEMS = [
  { from: path.join(root, "src", "app", "api"), to: path.join(stashDir, "src-app-api") },
  { from: path.join(root, "middleware.ts"), to: path.join(stashDir, "middleware.ts") },
  { from: path.join(root, "src", "app", "(app)", "ai-tutor"), to: path.join(stashDir, "ai-tutor") },
  { from: path.join(root, "src", "app", "(app)", "diagrams"), to: path.join(stashDir, "diagrams") },
  { from: path.join(root, "src", "app", "(app)", "ai-timetable"), to: path.join(stashDir, "ai-timetable") },
];

function run(cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

function move(src, dest) {
  if (fs.existsSync(src)) fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
}

function stash() {
  if (fs.existsSync(stashDir)) restore(); // recover from a previously interrupted run
  fs.mkdirSync(stashDir, { recursive: true });
  for (const item of STASH_ITEMS) {
    if (fs.existsSync(item.from)) move(item.from, item.to);
  }
}

function restore() {
  if (!fs.existsSync(stashDir)) return;
  for (const item of [...STASH_ITEMS].reverse()) {
    if (fs.existsSync(item.to)) {
      fs.rmSync(item.from, { recursive: true, force: true });
      move(item.to, item.from);
    }
  }
  fs.rmSync(stashDir, { recursive: true, force: true });
}

/**
 * .env.local is a Vercel dump full of `[SENSITIVE]` placeholders that would
 * otherwise win over the real `.env` values (Next loads .env.local first and
 * only skips keys already present in process.env). Pre-set every real value
 * from `.env` into the child env, and neutralize the Vercel markers so the
 * build never thinks it runs on Vercel.
 */
function loadRealEnv() {
  const out = {};
  const raw = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function build() {
  const realEnv = loadRealEnv();
  const env = { OFFLINE_BUILD: "1", NEXT_PUBLIC_OFFLINE_BUILD: "1" };
  for (const [k, v] of Object.entries(realEnv)) {
    if (process.env[k] === undefined) env[k] = v;
  }
  // The offline OTA updater downloads new web bundles from the deployed site (its own origin in
  // the shipped capacitor config, overridden by NEXT_PUBLIC_OTA_BASE when given).
  try {
    const capCfg = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
    const serverUrl = (capCfg.server && capCfg.server.url) || "";
    env.NEXT_PUBLIC_OTA_BASE = process.env.NEXT_PUBLIC_OTA_BASE || serverUrl;
    // Where the Study Flow cloud-sync calls go. The APK runs off-line by default but syncs
    // its study plans to the deployed site when online, so it needs the absolute origin.
    env.NEXT_PUBLIC_SYNC_BASE = process.env.NEXT_PUBLIC_SYNC_BASE || serverUrl;
  } catch {
    env.NEXT_PUBLIC_OTA_BASE = process.env.NEXT_PUBLIC_OTA_BASE || "";
    env.NEXT_PUBLIC_SYNC_BASE = process.env.NEXT_PUBLIC_SYNC_BASE || "";
  }
  // A previous run's OTA bundle inside public/ would be copied into the export; it is rebuilt
  // after the export anyway, so nothing is lost and the APK never carries its own update zip.
  fs.rmSync(path.join(root, "public", "offline-ota"), { recursive: true, force: true });
  // .env.local carries VERCEL=1 / VERCEL_ENV=production — force them off.
  for (const k of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_OIDC_TOKEN"]) {
    if (process.env[k] === undefined && realEnv[k] === undefined) env[k] = "";
  }
  fs.rmSync(path.join(root, "out"), { recursive: true, force: true });
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  return run(process.execPath, [nextBin, "build"], env);
}

function syncAndroid() {
  const capPath = path.join(root, "capacitor.config.json");
  const original = fs.readFileSync(capPath, "utf8");
  const cfg = JSON.parse(original);
  // server.url would make the WebView load the deployed site instead of the bundled export.
  delete cfg.server;
  fs.writeFileSync(capPath, JSON.stringify(cfg, null, "\t") + "\n");
  try {
    const capBin = path.join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
    const status = run(process.execPath, [capBin, "sync", "android"]);
    if (status !== 0) throw new Error("cap sync android failed with status " + status);
  } finally {
    fs.writeFileSync(capPath, original);
  }
}

function listFiles(dir, rel = "", out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "offline-ota") continue;
    const full = path.join(dir, entry.name);
    const r = rel ? rel + "/" + entry.name : entry.name;
    if (entry.isDirectory()) listFiles(full, r, out);
    else out.push(r);
  }
  return out;
}

function injectMeta(html, name, value) {
  if (html.includes(`name="${name}"`)) return html;
  const meta = `<meta name="${name}" content="${value}" />`;
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.slice(0, head.index + head[0].length) + meta + html.slice(head.index + head[0].length);
  return meta + html;
}

/**
 * Tags every exported HTML page with its build version and publishes the OTA artifacts the
 * installed app downloads (offline-build.zip + manifest.json) under public/offline-ota. Those two
 * files are what the APK pulls when the next web build is deployed.
 */
function emitOtaBundle(version) {
  const outDir = path.join(root, "out");
  for (const rel of listFiles(outDir)) {
    if (!rel.endsWith(".html")) continue;
    const f = path.join(outDir, rel);
    fs.writeFileSync(f, injectMeta(fs.readFileSync(f, "utf8"), "bp-version", version));
  }
  const archive = {};
  let fileCount = 0;
  for (const rel of listFiles(outDir)) {
    archive[rel] = new Uint8Array(fs.readFileSync(path.join(outDir, rel)));
    fileCount++;
  }
  const zipped = zipSync(archive, { level: 9 });
  const sha256 = createHash("sha256").update(zipped).digest("hex");
  const target = path.join(root, "public", "offline-ota");
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "offline-build.zip"), Buffer.from(zipped));
  const manifest = {
    version,
    size: zipped.length,
    sha256,
    files: fileCount,
    builtAt: new Date().toISOString(),
    zipUrl: "offline-build.zip",
  };
  fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `[build-offline] OTA bundle -> public/offline-ota/ (${zipped.length} bytes), version ${version}`
  );
  return manifest;
}

const t0 = Date.now();
let failed = false;
try {
  if (!skipDump) {
    const status = run(process.execPath, [path.join(root, "scripts", "dump-offline-content.mjs")]);
    if (status !== 0) throw new Error("content dump failed");
  }
  // Re-bundle the Telegram MTProto client (gramjs) so the vendored browser build always matches
  // src/lib/telegram/entry.ts. Requires internet only at build time.
  // Skipped with --skip-vendor when the gramjs stubs are unavailable; the prebuilt
  // src/lib/telegram/vendor/gramjs.browser.mjs is then used as-is.
  if (!skipVendor) {
    const vendorStatus = run(process.execPath, [path.join(root, "scripts", "vendor-gramjs.mjs")]);
    if (vendorStatus !== 0) throw new Error("vendor-gramjs failed");
  } else {
    console.log("[build-offline] skipping vendor-gramjs (--skip-vendor)");
  }
  stash();
  const status = build();
  if (status !== 0) throw new Error("next build failed with status " + status);
} catch (err) {
  failed = true;
  console.error("\n[build-offline] FAILED:", err.message);
} finally {
  restore();
}

if (!failed) {
  // Tag the export's HTML pages and publish the OTA zip+manifest BEFORE cap sync, so the same
  // meta the APK ships with also appears in public/offline-ota (the app skips a same-version
  // download). The zip is built from the post-meta export — what the app would rightly get.
  try {
    emitOtaBundle("v" + new Date().toISOString().replace(/[-:.T]/g, "").slice(0, 14));
  } catch (err) {
    failed = true;
    console.error("\n[build-offline] OTA bundle FAILED:", err.message);
  }
}

if (!failed && !skipSync) {
  try {
    syncAndroid();
  } catch (err) {
    failed = true;
    console.error("\n[build-offline] cap sync FAILED:", err.message);
  }
}

if (failed) process.exit(1);
console.log(
  `\n[build-offline] done in ${Math.round((Date.now() - t0) / 1000)}s — out/ exported` +
    (skipSync ? "" : " and synced into android/")
);
