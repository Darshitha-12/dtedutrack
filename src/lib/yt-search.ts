/**
 * Parses YouTube search results, shared by the online API route and the offline app.
 *
 * The offline APK strips its API routes and a page-level fetch to youtube.com would be blocked by
 * CORS, so there the WebView bridge fetches the results page natively and hands the raw
 * `ytInitialData` JSON straight to this parser — the same JSON the HTML embeds, so one parser
 * serves both paths.
 */

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

export const MAX_SEARCH_RESULTS = 24

/**
 * Accepts either the full results HTML or the raw `var ytInitialData = …` JSON slice (what the
 * native bridge returns) and yields the parsed data object.
 */
function extractYtInitialData(source: string): any | null {
  const trimmed = source.trimStart()
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  try {
    const marker = "var ytInitialData = "
    const idx = source.indexOf(marker)
    if (idx === -1) return null
    const start = idx + marker.length
    const end = source.indexOf(";</script>", start)
    return JSON.parse(source.slice(start, end > -1 ? end : start + 4_000_000))
  } catch {
    return null
  }
}

export function parseYtSearchResults(source: string, max = 18): YtSearchVideo[] {
  const videos: YtSearchVideo[] = []
  const seen = new Set<string>()
  const limit = Math.min(Math.max(Number.isFinite(max) ? max : 18, 1), MAX_SEARCH_RESULTS)
  const push = (v: YtSearchVideo) => {
    if (!v.id || seen.has(v.id) || videos.length >= limit) return
    seen.add(v.id)
    videos.push(v)
  }
  const data = extractYtInitialData(source)
  if (!data) return videos
  try {
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || []
    const items: any[] = []
    for (const s of sections) {
      const section = s?.itemSectionRenderer?.contents
      if (Array.isArray(section)) items.push(...section)
      // Some results sit inside a "shelf" (horizontal list) instead of the top-level item
      // section — collect those too.
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
            ?.image?.sources || lu.contentImage?.thumbnailViewModel?.image?.sources || []
        const durMatch = allParts
          .map(
            (t) =>
              t.match(/(\d+:\d{2}(?::\d{2})?)$/)?.[1] || t.match(/(\d+:\d{2}(?::\d{2})?)/)?.[1]
          )
          .find(Boolean)
        const firstRowText = rows[0]?.metadataParts?.[0]?.text?.content || ""
        if (ct === "LOCKUP_CONTENT_TYPE_VIDEO" || ct === "LOCKUP_CONTENT_TYPE_SHORTS") {
          push({
            id: lu.contentId,
            title,
            channel: firstRowText.split("·")[0].trim().replace(/^Video\s*$/, ""),
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
  } catch {
    /* ignore and return what we have */
  }
  return videos
}
