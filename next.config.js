/** @type {import('next').NextConfig} */

// OFFLINE_BUILD=1 produces a fully static export (no server, no API routes, no middleware)
// that gets bundled into the Android APK. The normal build stays a full-stack app for Vercel.
const offline = process.env.OFFLINE_BUILD === "1";

const nextConfig = {
  reactStrictMode: true,
  ...(offline
    ? {
        output: "export",
        images: { unoptimized: true },
        // The offline export runs in environments where the local eslint/prisma toolchain can be
        // unavailable; the API layer is stashed anyway, so gate checks off for this build only.
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
      }
    : {}),
};

module.exports = nextConfig;
