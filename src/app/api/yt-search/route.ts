import { NextRequest, NextResponse } from "next/server"
import { MAX_SEARCH_RESULTS, parseYtSearchResults, type YtSearchVideo } from "@/lib/yt-search"

export type { YtSearchVideo }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  const rawMax = parseInt(req.nextUrl.searchParams.get("max") || "18", 10)
  const max = Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : 18, 1), MAX_SEARCH_RESULTS)
  if (!q) {
    return NextResponse.json({ videos: [] as YtSearchVideo[] })
  }

  try {
    const searchUrl =
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(q) +
      "&hl=en&gl=US"
    const res = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+417",
      },
    })
    const html = await res.text()
    const videos = parseYtSearchResults(html, max)
    return NextResponse.json({ videos })
  } catch (_) {
    return NextResponse.json({ videos: [] as YtSearchVideo[], error: "search_failed" })
  }
}
