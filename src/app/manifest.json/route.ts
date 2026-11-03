import { NextResponse } from "next/server";

export async function GET() {
  const manifest = {
    name: "BioPulse",
    short_name: "BioPulse",
    description: "BioPulse Study App",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#22c55e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
