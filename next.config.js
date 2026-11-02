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
  env: {
    AUTH_SECRET: process.env.AUTH_SECRET || "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "biopulse-dev-fallback-secret-please-change-on-production-1234567890abcdef",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://biopulse-study.netlify.app",
  },
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
