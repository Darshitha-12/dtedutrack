import { NextRequest, NextResponse } from "next/server"

export interface YtSearchVideo {
  id: string
  title: string
  channel: string
  duration: string
  views: string
  published: string
  thumb: string
  list?: string
}

const MAX_RESULTS = 24

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  const rawMax = parseInt(req.nextUrl.searchParams.get("max") || "18", 10)
  const max = Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : 18, 1), MAX_RESULTS)
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
    const videos = parseSearch(html, max)
    return NextResponse.json({ videos })
  } catch (_) {
    return NextResponse.json({ videos: [] as YtSearchVideo[], error: "search_failed" })
  }
}

function parseSearch(html: string, max: number): YtSearchVideo[] {
  const videos: YtSearchVideo[] = []
  const seen = new Set<string>()
  const push = (v: YtSearchVideo) => {
    if (!v.id || seen.has(v.id) || videos.length >= max) return
    seen.add(v.id)
    videos.push(v)
  }
  try {
    const marker = "var ytInitialData = "
    const idx = html.indexOf(marker)
    if (idx === -1) return videos
    const start = idx + marker.length
    const end = html.indexOf(";</script>", idx)
    const slice = html.slice(start, end > -1 ? end : start + 4_000_000)
    const data = JSON.parse(slice)
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || []
    const items: any[] = []
    for (const s of sections) {
      const section = s?.itemSectionRenderer?.contents
      if (Array.isArray(section)) items.push(...section)
      // Some results sit inside a "shelf" (horizontal list) instead of the
      // top-level item section — collect those too.
      const shelfItems = s?.shelfRenderer?.content?.horizontalListRenderer?.items
      if (Array.isArray(shelfItems)) items.push(...shelfItems)
      const gridItems = s?.gridShelfViewModel
      if (gridItems) items.push(gridItems)
    }
    for (const it of items) {
      const vr = it?.videoRenderer
      if (vr && vr.videoId) {
        const thumbs = vr.thumbnail?.thumbnails || []
        push({
          id: vr.videoId,
          title: vr.title?.runs?.[0]?.text || "",
          channel: vr.ownerText?.runs?.[0]?.text || "",
          duration: vr.lengthText?.simpleText || "",
          views: vr.viewCountText?.simpleText || "",
          published: vr.publishedTimeText?.simpleText || "",
          thumb: thumbs.length ? thumbs[thumbs.length - 1].url : "",
        })
        continue
      }
      const lu = it?.lockupViewModel
      if (lu && lu.contentId) {
        const ct: string = lu.contentType || ""
        const md = lu.metadata?.lockupMetadataViewModel
        const title = md?.title?.content || ""
        if (!title) continue
        const rows: any[] = md?.metadata?.contentMetadataViewModel?.metadataRows || []
        const parts = (arr: any[]) => (arr || []).flatMap((r) => r?.metadataParts || [])
        const allParts = parts(rows).map((p) => p?.text?.content || "")
        const thumbSources =
          lu.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel
            ?.image?.sources ||
          lu.contentImage?.thumbnailViewModel?.image?.sources ||
          []
        const durMatch = allParts
          .map((t) => t.match(/(\d+:\d{2}(?::\d{2})?)$/)?.[1] || t.match(/(\d+:\d{2}(?::\d{2})?)/)?.[1])
          .find(Boolean)
        const firstRowText = rows[0]?.metadataParts?.[0]?.text?.content || ""
        if (ct === "LOCKUP_CONTENT_TYPE_VIDEO" || ct === "LOCKUP_CONTENT_TYPE_SHORTS") {
          push({
            id: lu.contentId,
            title,
            channel: firstRowText
              .split("·")[0]
              .trim()
              .replace(/^Video\s*$/, ""),
            duration: durMatch || "",
            views: "",
            published: "",
            thumb: thumbSources.length ? thumbSources[thumbSources.length - 1].url : "",
          })
        } else if (ct === "LOCKUP_CONTENT_TYPE_PLAYLIST") {
          push({
            id: lu.contentId,
            list: lu.contentId,
            title,
            channel: firstRowText,
            duration: "",
            views: "",
            published: "",
            thumb: thumbSources.length ? thumbSources[thumbSources.length - 1].url : "",
          })
        }
      }
    }
  } catch (_) {
    /* ignore and return what we have */
  }
  return videos
}