/**
 * Guards the Capacitor JS bridge.
 *
 * Only methods on the class passed to `addJavascriptInterface(new X(), "BioPulseBridge")` are
 * callable from the page. A `@JavascriptInterface` method declared anywhere else — even one
 * that compiles perfectly and looks correct in the file — is simply invisible to JavaScript:
 * the page sees `undefined`, every call silently does nothing, and the failure only surfaces
 * as broken behaviour at runtime. That is exactly how `saveCustomSound`/`hasCustomSound` sat
 * on MainActivity instead of JsBridge and made every custom alarm fall back to the system
 * ringtone for days.
 *
 * This check runs before every offline build: any @JavascriptInterface method whose enclosing
 * class is not the registered bridge class fails the build with a message naming the method
 * and the class it landed in.
 *
 *   node scripts/check-bridge-methods.mjs   (standalone)
 *   imported by scripts/build-offline.mjs   (gates the build)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Replaces comments and string/char literals with spaces (same length, same offsets) so brace
 * matching and regex scans see code only. JSON snippets like `{"a":1}` inside strings would
 * otherwise unbalance the depth count.
 */
function stripCommentsAndStrings(src) {
  const out = src.split("");
  const blank = (i) => {
    if (out[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") blank(i++);
    } else if (c === "/" && c2 === "*") {
      blank(i++);
      blank(i++);
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) blank(i++);
      if (i < n) {
        blank(i++);
        blank(i++);
      }
    } else if (c === '"' || c === "'") {
      const quote = c;
      blank(i++);
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          blank(i++);
          if (i < n) blank(i++);
        } else {
          blank(i++);
        }
      }
      if (i < n) blank(i++);
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * @returns {string[]} human-readable problems — empty when every @JavascriptInterface method
 * lives on the registered bridge class.
 */
export function checkBridgeMethods(javaFilePath) {
  const problems = [];
  if (!fs.existsSync(javaFilePath)) {
    return [`${javaFilePath}: file not found`];
  }
  const src = fs.readFileSync(javaFilePath, "utf8");
  const code = stripCommentsAndStrings(src);
  const rel = path.basename(javaFilePath);

  const registered = /\baddJavascriptInterface\s*\(\s*new\s+([A-Za-z_$][\w$]*)\s*\(/.exec(code);
  if (!registered) {
    return [`${rel}: no addJavascriptInterface(new X(), ...) call found — nothing to check against`];
  }
  const bridgeClass = registered[1];

  // Class declaration ranges: innermost class containing an index wins.
  const classRanges = [];
  const classRe = /\bclass\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = classRe.exec(code)) !== null) {
    const open = code.indexOf("{", m.index + m[0].length);
    if (open < 0) continue;
    let depth = 0;
    let close = -1;
    for (let j = open; j < code.length; j++) {
      if (code[j] === "{") depth++;
      else if (code[j] === "}") {
        depth--;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close < 0) continue;
    classRanges.push({ name: m[1], start: m.index, end: close });
  }

  const innermostClassAt = (index) => {
    let best = null;
    for (const range of classRanges) {
      if (index >= range.start && index < range.end) {
        if (!best || range.start > best.start) best = range;
      }
    }
    return best ? best.name : "(top level)";
  };

  const annRe = /@JavascriptInterface/g;
  while ((m = annRe.exec(code)) !== null) {
    const owner = innermostClassAt(m.index);
    const tail = code.slice(m.index, m.index + 300).replace(/^\s*@JavascriptInterface\s*/, "");
    const sig = /\b([A-Za-z_$][\w$]*)\s*\(/.exec(tail);
    const method = sig ? sig[1] : "(unknown)";
    if (owner !== bridgeClass) {
      problems.push(
        `${rel}: @JavascriptInterface ${method}() is inside class ${owner}, but the page can ` +
          `only call methods on ${bridgeClass} (the object passed to addJavascriptInterface)`,
      );
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target =
    process.argv[2] ??
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..", "android", "app", "src", "main", "java", "com", "biopulse", "app", "MainActivity.java",
    );
  const problems = checkBridgeMethods(target);
  if (problems.length) {
    console.error("bridge interface check FAILED:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("bridge interface check: OK");
}
