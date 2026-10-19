// scripts/ci-build.mjs — TEMPORARY diagnostic build wrapper.
//
// Runs the normal Next.js production build exactly like Netlify's UI build
// command ("npm run build") would, and when the build fails it ships the tail
// of the build output to an ntfy topic so the failure can be inspected.
//
// Why: Netlify's build-log API (GET /deploys/{id}/log) returns 404 for this
// site, so the real error text is otherwise unreachable. Remove this file and
// restore `command = "npm run build"` once the failure is understood.
import { spawn } from "node:child_process";
import fs from "node:fs";

const TOPIC = "dtedutrack-diag-7f3a91";
const LOG = "/tmp/ci-build.log";

async function notify(title, body) {
  try {
    const res = await fetch(`https://ntfy.sh/${TOPIC}`, {
      method: "POST",
      headers: { Title: title },
      body,
    });
    console.log(`[ci-build] ntfy -> ${res.status} (${title})`);
  } catch (e) {
    console.error("[ci-build] ntfy failed:", e.message);
  }
}

await notify("biopulse build started", `node ${process.version}`);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const out = fs.createWriteStream(LOG);
const child = spawn(npm, ["run", "build"], { stdio: ["ignore", "pipe", "pipe"], env: process.env });

child.stdout.on("data", (d) => {
  process.stdout.write(d);
  out.write(d);
});
child.stderr.on("data", (d) => {
  process.stderr.write(d);
  out.write(d);
});

const code = await new Promise((resolve) => child.on("close", resolve));
out.end();

const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "(no build log captured)";
const tail = text.slice(-3800);

if (code !== 0) {
  console.error(`[ci-build] build failed with exit code ${code}`);
  await notify(`biopulse build exit ${code}`, tail);
} else {
  await notify("biopulse build OK", "exit 0");
}

process.exit(code);
