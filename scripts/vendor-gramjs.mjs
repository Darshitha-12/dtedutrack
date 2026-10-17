import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const stubDir = path.join(root, "scripts", "gramjs-stubs");
const out = path.join(root, "src", "lib", "telegram", "vendor", "gramjs.browser.mjs");

async function main() {
  await build({
    entryPoints: [path.join(root, "src", "lib", "telegram", "entry.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    sourcemap: false,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    alias: {
      crypto: path.join(stubDir, "crypto.js.mjs"),
      fs: path.join(stubDir, "fs.js"),
      net: path.join(stubDir, "net.js"),
      os: path.join(stubDir, "os.js"),
      socks: path.join(stubDir, "socks.js"),
      websocket: path.join(stubDir, "websocket.js"),
      util: path.join(stubDir, "util.js"),
      "node-localstorage": path.join(stubDir, "node-localstorage.js"),
      path: "path-browserify",
    },
    logLevel: "info",
    outfile: out,
  });
  const buf = Buffer.from(await import("node:fs").then((fs) => fs.readFileSync(out)));
  console.log(`[vendor-gramjs] -> ${out} (${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});