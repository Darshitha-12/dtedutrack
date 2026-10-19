// tools/netlify-diag/index.js — TEMPORARY diagnostic Netlify build plugin.
//
// Netlify's build-log API returns 404 for this site, so we cannot read the real
// build error. This local plugin reports every build lifecycle phase (and, most
// importantly, the onError payload) to an ntfy topic so the failure is visible.
//
// Remove this directory and its [[plugins]] entry in netlify.toml once done.
const TOPIC = "dtedutrack-diag-7f3a91";

async function notify(title, body) {
  try {
    const res = await fetch(`https://ntfy.sh/${TOPIC}`, {
      method: "POST",
      headers: { Title: title },
      body: String(body ?? "").slice(0, 3800),
    });
    console.log(`[netlify-diag] ${title} -> ${res.status}`);
  } catch (e) {
    console.log(`[netlify-diag] notify failed: ${e.message}`);
  }
}

module.exports = {
  async onPreBuild() {
    await notify("diag: onPreBuild", `node ${process.version} cwd=${process.cwd()}`);
  },
  async onBuild() {
    await notify("diag: onBuild", "entered onBuild");
  },
  async onPostBuild() {
    await notify("diag: onPostBuild", "entered onPostBuild");
  },
  async onSuccess() {
    await notify("diag: onSuccess", "build succeeded");
  },
  async onError({ error }) {
    const msg = error && (error.message || String(error));
    const extra = [];
    if (error && error.stack) extra.push(String(error.stack).slice(0, 1800));
    if (error && error.location) extra.push("location: " + JSON.stringify(error.location));
    await notify("diag: onError", `${msg}\n\n${extra.join("\n")}`);
  },
  async onEnd({ status }) {
    await notify("diag: onEnd", JSON.stringify(status));
  },
};
