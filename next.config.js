/** @type {import('next').NextConfig} */

// OFFLINE_BUILD=1 produces a fully static export (no server, no API routes, no middleware)
// that gets bundled into the Android APK. The normal build stays a full-stack app for Vercel.
const offline = process.env.OFFLINE_BUILD === "1";

// The Android APK ships the offline web bundle and loads it from Capacitor's local origin
// (https://localhost), so every /api/chat/* call it makes is cross-origin to the deployed site.
// It authenticates with its long-lived device token (Authorization: Bearer …) rather than a
// cookie, so a permissive origin is safe: the browser never attaches credentials on its own.
const CHAT_CORS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, Accept" },
  { key: "Access-Control-Max-Age", value: "86400" },
];

const nextConfig = {
  reactStrictMode: true,
  // Server-only secrets (AUTH_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL) must NOT live in
  // `env:`: Next inlines those into both bundles, which both leaks the auth secret to the
  // browser and rewrites runtime writes such as `process.env.AUTH_SECRET = …` into illegal
  // assignments (`"…".AUTH_SECRET = …` → SyntaxError, which killed the whole auth module).
  ...(offline
    ? {
        output: "export",
        images: { unoptimized: true },
        // The offline export runs in environments where the local eslint/prisma toolchain can be
        // unavailable; the API layer is stashed anyway, so gate checks off for this build only.
        typescript: { ignoreBuildErrors: true },
      }
    : {
        async headers() {
          return [{ source: "/api/chat/:path*", headers: CHAT_CORS }];
        },
      }),
};

module.exports = nextConfig;
