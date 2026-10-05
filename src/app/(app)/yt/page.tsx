"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Youtube,
  Play,
  Pause,
  Link2,
  Clock,
  X,
  Music2,
  Search,
  Loader2,
  Maximize2,
  Minimize2,
  PictureInPicture2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"

interface SavedVideo {
  id: string
  title: string
  at: number
  list?: string
}

interface SearchVideo {
  id: string
  title: string
  channel: string
  duration: string
  views: string
  published: string
  thumb: string
  list?: string
}

const SAVED_KEY = "bp_yt_saved_v1"
const MAX_SAVED = 24

const PRESETS: SavedVideo[] = [
  { id: "jfKfPfyJRdk", title: "🎧 Lofi study radio (ad-free)", at: 0 },
]

function extractVideo(urlOrId: string): { id: string; list: string } | null {
  const raw = urlOrId.trim()
  if (!raw) return null
  if (/^[\w-]{11}$/.test(raw)) return { id: raw, list: "" }
  try {
    const u = new URL(raw.includes("://") ? raw : "https://" + raw)
    if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
      const list = u.searchParams.get("list") || ""
      let id = ""
      if (u.hostname === "youtu.be") {
        id = u.pathname.split("/").filter(Boolean)[0] || ""
      } else {
        id = u.searchParams.get("v") || ""
        if (!id) {
          const parts = u.pathname.split("/").filter(Boolean)
          const last = parts[parts.length - 1] || ""
          if (
            ["watch", "embed", "shorts", "live", "playlist"].includes(parts[0] || "") ||
            /^[\w-]{11}$/.test(last)
          ) {
            id = /^[\w-]{11}$/.test(last) ? last : ""
          }
        }
      }
      return id ? { id, list } : null
    }
  } catch {
    return null
  }
  return null
}

function bridge(state: string, title = "") {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.ytState === "function") b.ytState(state, title)
  } catch {
    /* not in the Android shell */
  }
}

function nativeKeepScreenOn(on: boolean) {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.setKeepScreenOn === "function") b.setKeepScreenOn(on)
  } catch {
    /* not in the Android shell */
  }
}

/** Feeds the notification progress bar (and, via native, the background keepalive clock). */
function nativeProgress(positionSeconds: number, durationSeconds: number) {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.ytProgress === "function") {
      b.ytProgress(positionSeconds, durationSeconds)
    }
  } catch {
    /* not in the Android shell */
  }
}

function nativeDebug(msg: string) {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.log === "function") b.log(msg)
  } catch {}
}

async function lockLandscape(lock: boolean) {
  try {
    const so = (screen as any).orientation
    if (!so) return
    if (lock) {
      if (typeof so.lock === "function") await so.lock("landscape")
    } else if (typeof so.unlock === "function") {
      so.unlock()
    }
  } catch {
    /* orientation lock unsupported (web / not fullscreen) */
  }
}

export default function YtPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 md:p-6">
          <Youtube className="h-5 w-5 text-red-500" />
        </div>
      }
    >
      <YtInner />
    </Suspense>
  )
}

function YtInner() {
  const params = useSearchParams()
  const [video, setVideo] = React.useState<{ id: string; list: string } | null>(null)
  const [nowTitle, setNowTitle] = React.useState("")
  const [playing, setPlaying] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchVideo[]>([])
  const [searching, setSearching] = React.useState(false)
  const [searched, setSearched] = React.useState("")
  const [searchErr, setSearchErr] = React.useState("")
  const [saved, setSaved] = React.useState<SavedVideo[]>([])
  const [pasteOpen, setPasteOpen] = React.useState(false)
  const [pasteUrl, setPasteUrl] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [fs, setFs] = React.useState(false)
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const stateRef = React.useRef<string>("idle")
  const currentId = React.useRef("")
  const titleRef = React.useRef("Video")
  const shouldPlayRef = React.useRef(false)
  const userPausedRef = React.useRef(false)
  const seekingRef = React.useRef(false)
  const lastResumeKickRef = React.useRef(0)
  const postCmdRef =
    React.useRef<(cmd: string, args?: unknown[]) => void>(() => {})
  const lastProgressRef = React.useRef<{ pos: number; dur: number } | null>(null)

  const loadSaved = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY)
      const arr = raw ? (JSON.parse(raw) as SavedVideo[]) : []
      setSaved(
        PRESETS.concat(
          arr.filter((v) => v && v.id && v.id !== "jfKfPfyJRdk").slice(0, MAX_SAVED),
        ),
      )
    } catch {
      setSaved(PRESETS)
    }
  }, [])

  React.useEffect(() => {
    loadSaved()
  }, [loadSaved])

  React.useEffect(() => {
    const v = params.get("v") ?? params.get("id")
    const url = params.get("url")
    let parsed: { id: string; list: string } | null = null
    if (url) parsed = extractVideo(url)
    else if (v) parsed = extractVideo(v)
    if (parsed) {
      titleRef.current = "Video"
      setVideo(parsed)
      setNowTitle("Video")
      addToSaved(parsed.id, "Video")
      shouldPlayRef.current = true
      userPausedRef.current = false
      bridge("playing", "Video")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const addToSaved = (id: string, title: string, list = "") => {
    if (id === "jfKfPfyJRdk" || id === currentId.current) return
    currentId.current = id
    try {
      const arr = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as SavedVideo[]
      const next = [{ id, title: title || "Video", at: Date.now(), list } as SavedVideo].concat(
        arr.filter((v) => v.id !== id),
      )
      localStorage.setItem(SAVED_KEY, JSON.stringify(next.slice(0, MAX_SAVED)))
    } catch {
      /* ignore */
    }
  }

  const play = (id: string, title = "", list = "") => {
    if (id && id === currentId.current && !list && video) return
    const t = title || (list ? "Playlist" : "Video")
    if (list) {
      setVideo({ id: "", list })
      setNowTitle(t)
    } else {
      setVideo({ id, list: "" })
      setNowTitle(t)
    }
    titleRef.current = t
    if (id) addToSaved(id, title, list)
    shouldPlayRef.current = true
    userPausedRef.current = false
    bridge("playing", t)
  }

  const doSearch = async (q = query) => {
    const qq = q.trim()
    if (!qq || searching) return
    setSearching(true)
    setSearchErr("")
    setResults([])
    setSearched(qq)
    try {
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(qq)}&max=18`)
      const data = await res.json()
      if (!res.ok) throw new Error("bad")
      const list: SearchVideo[] = data?.videos || []
      setResults(list)
      if (list.length === 0) setSearchErr("No results. Try different words.")
    } catch (_) {
      setResults([])
      setSearchErr("Search needs an internet connection. You are likely offline.")
    } finally {
      setSearching(false)
    }
  }

  const onState = (st: string) => {
    if (stateRef.current === st) return
    stateRef.current = st
    if (st === "playing") {
      setPlaying(true)
      shouldPlayRef.current = !userPausedRef.current && shouldPlayRef.current
      bridge("playing", titleRef.current)
    } else if (st === "paused") {
      setPlaying(false)
      if (!shouldPlayRef.current) bridge("paused", titleRef.current)
    } else if (st === "ended") {
      setPlaying(false)
      userPausedRef.current = false
      shouldPlayRef.current = false
      bridge("idle", titleRef.current)
    }
  }

  React.useEffect(() => {
    postCmdRef.current = (cmd: string, args: unknown[] = []) => {
      const f = iframeRef.current
      if (!f) return
      try {
        f.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: cmd, args }),
          "*",
        )
      } catch {
        /* ignore */
      }
    }
    ;(window as any).__bp_yt = (action: string) => {
      if (action === "play") {
        shouldPlayRef.current = true
        userPausedRef.current = false
      } else if (action === "pause") {
        shouldPlayRef.current = false
        userPausedRef.current = true
      } else if (action === "keepalive") {
        // Pushed from the native foreground service every couple of seconds. Background JS
        // timers are throttled to about once a minute, which is far too slow to stop YouTube
        // from dropping its audio track once the app leaves the foreground.
        if (!shouldPlayRef.current || userPausedRef.current) return
        postCmdRef.current("unMute")
        postCmdRef.current("setVolume", [100])
        postCmdRef.current("playVideo")
        const p = lastProgressRef.current
        if (p) nativeProgress(p.pos, p.dur)
        return
      }
      postCmdRef.current(action)
    }
    const onMsg = (e: MessageEvent) => {
      try {
        const src = iframeRef.current?.contentWindow
        if (!src || e.source !== src) return
        let d: any = e.data
        if (typeof d === "string") d = JSON.parse(d)
        let st: number | undefined
        if (d.event === "infoDelivery" && d.info && typeof d.info.playerState === "number") {
          st = d.info.playerState
          // infoDelivery also carries the playhead — use it for the notification progress bar.
          const pos = Number(d.info.currentTime)
          const dur = Number(d.info.duration)
          if (Number.isFinite(pos) && Number.isFinite(dur) && dur > 0) {
            lastProgressRef.current = { pos, dur }
            nativeProgress(pos, dur)
          }
          // The embed pauses itself once the app leaves the foreground, but infoDelivery keeps
          // flowing. Recover right here instead of waiting for the (heavily throttled) keepalive
          // timer — background timers can be a minute apart, which is long enough for YouTube to
          // drop the audio track entirely.
          if (
            st !== 1 &&
            shouldPlayRef.current &&
            !userPausedRef.current &&
            !seekingRef.current
          ) {
            const now = Date.now()
            if (now - lastResumeKickRef.current > 3000) {
              lastResumeKickRef.current = now
              nativeDebug("resume kick, state=" + st + " pos=" + pos)
              postCmdRef.current("unMute")
              postCmdRef.current("setVolume", [100])
              postCmdRef.current("playVideo")
            }
          }
        } else if (d.event === "onStateChange") {
          st = typeof d.data === "number" ? d.data : d.state
        }
        // 1 playing, 2 paused, 0 ended; ignore -1/3/5 (unstarted/buffering/cued)
        if (st === 1) onState("playing")
        else if (st === 2) onState("paused")
        else if (st === 0) onState("ended")
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("message", onMsg)
    return () => {
      window.removeEventListener("message", onMsg)
      bridge("idle")
      delete (window as any).__bp_yt
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video])

  // Keepalive + heartbeats: while the user wants playback, re-issue playVideo
  // so the embed never stays paused in the background (YouTube sometimes pauses
  // when the page is hidden / screen locks), and re-declare "listening" so the
  // iframe keeps sending player-state events.
  React.useEffect(() => {
    if (!video) return
    let tick = 0
    const t = window.setInterval(() => {
      tick++
      if (!shouldPlayRef.current || userPausedRef.current) {
        if (tick % 10 === 0) {
          try {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: (Math.random() * 1e6) | 0 }),
              "*",
            )
          } catch {
            /* ignore */
          }
        }
        return
      }
      try {
        const f = iframeRef.current
        if (!f) return
        f.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "playVideo", args: [] }),
          "*",
        )
        if (tick % 5 === 0) {
          f.contentWindow?.postMessage(
            JSON.stringify({ event: "listening", id: (Math.random() * 1e6) | 0 }),
            "*",
          )
        }
      } catch {
        /* ignore */
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [video])

  const onIframeLoad = () => {
    const f = iframeRef.current
    if (!f) return
    try {
      f.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: (Math.random() * 1e6) | 0 }),
        "*",
      )
    } catch {
      /* ignore */
    }
  }

  // Fullscreen: rotate to landscape and keep the screen awake only while expanded.
  React.useEffect(() => {
    if (fs) {
      nativeKeepScreenOn(true)
      lockLandscape(true)
    } else {
      nativeKeepScreenOn(false)
      lockLandscape(false)
    }
    return () => {
      nativeKeepScreenOn(false)
    }
  }, [fs])

  React.useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fs])

  // Leaving the page while expanded should not leave the rotation locked.
  React.useEffect(() => {
    const onHide = () => {
      nativeKeepScreenOn(false)
    }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [])

  // Coming back from the home screen / lock screen: Android restarts the WebView video
  // pipeline but the YouTube embed never re-announces its state, so the page keeps
  // thinking it is paused and the audio session stays dead. Nudge the embed and clear the
  // stale state cache whenever the page becomes visible again.
  React.useEffect(() => {
    const send = (func: string, args: unknown[] = []) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*",
        )
      } catch {
        /* ignore */
      }
    }

    const kick = () => {
      if (!shouldPlayRef.current || userPausedRef.current) return
      send("listening")
      // The embed frequently comes back from the background muted or with a wedged audio
      // session, so unmute + restore volume before asking it to play again.
      send("unMute")
      send("setVolume", [100])
      send("playVideo")
      stateRef.current = ""
      setPlaying(true)
      bridge("playing", titleRef.current)
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      // Two passes: the first re-arms the embed, the second catches the case where the audio
      // session was still not ready when we asked.
      kick()
      window.setTimeout(kick, 700)
    }

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", onVisible)
      window.removeEventListener("focus", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePlay = () => {
    if (!iframeRef.current || !video) return
    if (playing) {
      userPausedRef.current = true
      shouldPlayRef.current = false
      postCmdRef.current("pauseVideo")
      bridge("paused", titleRef.current)
    } else {
      userPausedRef.current = false
      shouldPlayRef.current = true
      postCmdRef.current("playVideo")
      bridge("playing", titleRef.current)
    }
  }

  const onPastePlay = () => {
    const parsed = extractVideo(pasteUrl)
    if (!parsed) return
    if (parsed.id) play(parsed.id)
    else play("", "Playlist", parsed.list)
    setPasteUrl("")
  }

  const readClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) {
        setPasteUrl(t)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }
    } catch {
      /* clipboard blocked */
    }
  }

  const embedSrc = (() => {
    if (!video) return ""
    const q = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      autoplay: "1",
      enablejsapi: "1",
    })
    if (video.list)
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${video.list}&${q.toString()}`
    return `https://www.youtube-nocookie.com/embed/${video.id}?${q.toString()}`
  })()

  const removeSaved = (id: string) => {
    if (id === "jfKfPfyJRdk") return
    try {
      const arr = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]") as SavedVideo[]
      localStorage.setItem(
        SAVED_KEY,
        JSON.stringify(arr.filter((v) => v.id !== id)),
      )
    } catch {
      /* ignore */
    }
    loadSaved()
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 md:p-6">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-red-500/15 flex items-center justify-center">
          <Youtube className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">YT Player</h1>
          <p className="text-xs text-muted-foreground">
            Ad-free playback · runs in the background · control from the lock screen notification
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Search YouTube… e.g. A/L Biology lessons"
          className="flex-1"
        />
        <Button onClick={() => doSearch()} type="button" variant="destructive" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? "Searching" : "Search"}
        </Button>
      </div>

      {/* Player — inline by default, true fullscreen overlay when expanded */}
      {fs && (
        <button
          type="button"
          aria-label="Exit fullscreen"
          onClick={() => setFs(false)}
          className="fixed inset-0 z-[190] h-[100dvh] w-screen cursor-default bg-black/90"
        />
      )}

      <Card
        className={
          fs
            ? "fixed inset-0 z-[200] h-[100dvh] w-screen max-w-none rounded-none border-0 bg-black p-0 shadow-none"
            : "p-2"
        }
      >
        <div
          className={
            fs
              ? "relative h-[100dvh] w-screen overflow-hidden bg-black"
              : "relative w-full aspect-video overflow-hidden rounded-xl bg-black"
          }
        >
          {video ? (
            <>
              <iframe
                ref={iframeRef}
                src={embedSrc}
                title="YouTube player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
                onLoad={onIframeLoad}
              />
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={togglePlay}
                className="absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-transform active:scale-95"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Picture in picture"
                  onClick={async () => {
                    try {
                      const d = iframeRef.current as any
                      if (d?.requestPictureInPicture) await d.requestPictureInPicture()
                    } catch {
                      /* PiP unsupported */
                    }
                  }}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-transform active:scale-95"
                >
                  <PictureInPicture2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
                  onClick={() => setFs((v) => !v)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-transform active:scale-95"
                >
                  {fs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Youtube className="h-10 w-10 text-red-500/50" />
              <p className="text-sm">Search a topic and tap a video to start watching</p>
            </div>
          )}
        </div>
      </Card>

      {video && !fs && (
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2">{nowTitle}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            Background playback is on — press back or lock the screen and control it from the
            notification. Use the expand button for fullscreen.
          </p>
        </div>
      )}

      {/* Search results */}
      {searching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching for “{searched}”…
        </p>
      )}
      {searchErr && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
          {searchErr}
        </p>
      )}
      {results.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Results for “{searched}”</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => play(r.id, r.title, r.list)}
                className="group text-left rounded-xl overflow-hidden border border-border bg-card hover:border-red-500/50 transition-colors"
              >
                <div className="relative aspect-video w-full bg-muted">
                  {r.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumb}
                      alt={r.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Play className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {r.duration && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-semibold text-white">
                      {r.duration}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-5 w-5 text-white" />
                    </span>
                  </span>
                </div>
                <div className="p-2">
                  <p className="line-clamp-2 text-xs font-medium leading-snug">{r.title}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{r.channel}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[r.views, r.published].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick picks */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Music2 className="h-4 w-4 text-muted-foreground" /> Quick picks
        </h2>
        <div className="flex flex-wrap gap-2">
          {saved.map((s) => (
            <span
              key={s.id}
              onClick={() => play(s.id, s.title, s.list || "")}
              className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                s.title?.startsWith("🎧")
                  ? "border-red-500/30 bg-red-500/5 text-red-500"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <Youtube
                className={`h-3.5 w-3.5 ${
                  s.title?.startsWith("🎧") ? "text-red-500" : "text-muted-foreground"
                }`}
              />
              <span className="max-w-[180px] truncate">
                {s.title?.startsWith("🎧") ? s.title : s.title || "Video"}
              </span>
              {!s.title?.startsWith("🎧") && (
                <X
                  className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSaved(s.id)
                  }}
                />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Optional "paste a link" */}
      <div className="rounded-lg border border-border bg-card p-3">
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <Link2 className="h-4 w-4" /> {pasteOpen ? "Close paste link" : "Paste a video link (optional)"}
        </button>
        {pasteOpen && (
          <div className="mt-2 flex gap-2">
            <Input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onPastePlay()}
              placeholder="YouTube link or video ID"
              className="flex-1"
            />
            <Button variant="outline" onClick={readClipboard} type="button" title="Paste from clipboard">
              <Link2 className="h-4 w-4" />
              {copied ? "Copied" : "Paste"}
            </Button>
            <Button onClick={onPastePlay} type="button" variant="destructive">
              <Play className="h-4 w-4" /> Play
            </Button>
          </div>
        )}
      </div>

      {/* History note */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Videos you play are saved on this device for quick replay.
      </p>
    </div>
  )
}