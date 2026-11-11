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
  Smartphone,
  Share2,
  BookmarkPlus,
  BookmarkCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { parseYtSearchResults } from "@/lib/yt-search"

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

const CHIPS: { label: string; q: string }[] = [
  { label: "All", q: "" },
  { label: "A/L Biology", q: "A/L Biology lessons" },
  { label: "Physics", q: "A/L Physics lessons" },
  { label: "Chemistry", q: "A/L Chemistry lessons" },
  { label: "Combined Maths", q: "Combined Maths lessons" },
  { label: "Lofi study", q: "lofi study music" },
  { label: "Past papers", q: "A/L past paper discussion" },
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

/**
 * Tells native the user wants audio to keep playing, independent of what the embed is currently
 * doing. The embed pauses itself whenever the app is backgrounded, so a plain "is it playing?"
 * flag flips to false exactly when background audio matters most — and native would then skip
 * picture-in-picture and tear the service down. Only real user intent clears this.
 */
function playbackIntent(active: boolean) {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.playbackIntent === "function") b.playbackIntent(active)
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

/**
 * Searches YouTube through the Android bridge: the offline build strips the search API route and
 * a plain fetch to youtube.com from the page would be blocked by CORS, so the WebView fetches and
 * extracts the results natively.
 *
 * Resolves with the raw `ytInitialData` JSON ("" = no network / fetch failed), or `null` when
 * there is no bridge (browser, online build) — the caller then falls back to /api/yt-search.
 */
function nativeYtSearch(query: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null)
      return
    }
    const b = (window as any).BioPulseBridge
    if (!b || typeof b.ytSearch !== "function") {
      resolve(null)
      return
    }
    const w = window as any
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const prev = w.__bp_yt_search
    let done = false
    let timer = 0
    const finish = (value: string | null) => {
      if (done) return
      done = true
      w.__bp_yt_search = prev
      window.clearTimeout(timer)
      resolve(value)
    }
    w.__bp_yt_search = (rid: string, json: string) => {
      if (rid === id) finish(json || "")
    }
    timer = window.setTimeout(() => finish(""), 15000)
    try {
      b.ytSearch(id, query)
    } catch {
      finish(null)
    }
  })
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
  const [pipHint, setPipHint] = React.useState("")
  // The Android shell has a real foreground service + notification; the browser does not, so the
  // guidance shown under the player has to differ.
  const [inApp, setInApp] = React.useState(false)

  React.useEffect(() => {
    setInApp(Boolean((window as any).BioPulseBridge?.ytState))
  }, [])

  // Android picture-in-picture renders the whole activity, not just the iframe. Native calls this
  // before entering PiP so the page can hide everything except the player; the iframe stays
  // mounted, so playback is never interrupted by a re-render.
  React.useEffect(() => {
    ;(window as any).__bp_pip = (on: boolean) => {
      document.documentElement.classList.toggle("bp-pip", Boolean(on))
    }
    return () => {
      delete (window as any).__bp_pip
      document.documentElement.classList.remove("bp-pip")
    }
  }, [])
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
  // Last player state the embed reported (1 playing, 2 paused, 0 ended, …). Used so the
  // keepalive only nudges playback when it actually stalled instead of every second.
  const playerStateRef = React.useRef<number>(-1)
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
    playbackIntent(true)
  }

  const [online, setOnline] = React.useState(true)

  React.useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  const doSearch = async (q = query) => {
    const qq = q.trim()
    if (!qq || searching) return
    setSearching(true)
    setSearchErr("")
    setResults([])
    setSearched(qq)
    try {
      const native = await nativeYtSearch(qq)
      if (native !== null) {
        // Android shell: the API routes are stripped from the offline build, so the bridge
        // fetches the results page and we parse the same ytInitialData JSON here.
        const list: SearchVideo[] = native ? parseYtSearchResults(native, 18) : []
        setResults(list)
        if (list.length === 0) {
          setSearchErr(
            native
              ? "No results. Try different words."
              : "Search needs an internet connection. You are likely offline."
          )
        }
        return
      }
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
      playerStateRef.current = 1
      setPlaying(true)
      shouldPlayRef.current = !userPausedRef.current && shouldPlayRef.current
      bridge("playing", titleRef.current)
    } else if (st === "paused") {
      playerStateRef.current = 2
      setPlaying(false)
      if (!shouldPlayRef.current) bridge("paused", titleRef.current)
    } else if (st === "ended") {
      playerStateRef.current = 0
      setPlaying(false)
      userPausedRef.current = false
      shouldPlayRef.current = false
      bridge("idle", titleRef.current)
      playbackIntent(false)
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
      // Lock-screen / notification scrubber: native sends "seek:<seconds>".
      if (action.startsWith("seek:")) {
        const target = Number(action.slice(5))
        if (Number.isFinite(target) && target >= 0) {
          seekingRef.current = true
          postCmdRef.current("seekTo", [target, true])
          lastProgressRef.current = { pos: target, dur: lastProgressRef.current?.dur || 0 }
          window.setTimeout(() => {
            seekingRef.current = false
          }, 1500)
        }
        return
      }
      if (action === "play") {
        shouldPlayRef.current = true
        userPausedRef.current = false
        playbackIntent(true)
        // The IFrame API names these playVideo/pauseVideo; forwarding "play" verbatim was a
        // no-op, so the lock-screen buttons changed the flags but never touched the embed.
        postCmdRef.current("unMute")
        postCmdRef.current("setVolume", [100])
        postCmdRef.current("playVideo")
        return
      }
      if (action === "pause" || action === "stop") {
        shouldPlayRef.current = false
        userPausedRef.current = true
        playbackIntent(false)
        postCmdRef.current(action === "stop" ? "stopVideo" : "pauseVideo")
        return
      }
      if (action === "keepalive") {
        // Pushed from the native foreground service every couple of seconds. Background JS
        // timers are throttled to about once a minute, which is far too slow to stop YouTube
        // from dropping its audio track once the app leaves the foreground.
        if (!shouldPlayRef.current || userPausedRef.current) return
        postCmdRef.current("unMute")
        postCmdRef.current("setVolume", [100])
        postCmdRef.current("playVideo")
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
        if (d.event === "infoDelivery" && d.info) {
          // playerState is optional: the embed omits it on most ticks once playback is steady,
          // and requiring it here was why the notification clock only advanced in fits.
          if (typeof d.info.playerState === "number") {
            const state: number = d.info.playerState
            st = state
            playerStateRef.current = state
          }
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
          // Never recover from the "ended" state (0): issuing playVideo there would restart the
          // finished video, which is exactly the unwanted auto-repeat.
          if (
            st !== undefined &&
            st !== 1 &&
            st !== 0 &&
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
          if (typeof st === "number") playerStateRef.current = st
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
      playbackIntent(false)
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
        // Only nudge playback when the embed reports it is NOT already playing. Firing
        // playVideo every second fights the player chrome and, right at the end of a clip,
        // can restart it — so we recover only from a genuine stall.
        if (playerStateRef.current !== 1) {
          f.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            "*",
          )
        }
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

    // Leaving the app (Home / app switch) must not pause anything: the native mediaPlayback
    // foreground service and its MediaSession keep the pipeline alive. Re-assert play the instant
    // we go hidden so the embed's own visibility handler (which YouTube wires to pause) does not
    // win the race and drop the audio track before the service can nudge it back.
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return
      if (!shouldPlayRef.current || userPausedRef.current) return
      send("unMute")
      send("setVolume", [100])
      send("playVideo")
    }

    document.addEventListener("visibilitychange", onVisible)
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pageshow", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      document.removeEventListener("visibilitychange", onHidden)
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
      playbackIntent(false)
    } else {
      userPausedRef.current = false
      shouldPlayRef.current = true
      postCmdRef.current("playVideo")
      bridge("playing", titleRef.current)
      playbackIntent(true)
    }
  }

  const openInYouTubeApp = () => {
    const id = currentId.current || video?.id
    if (!id) return
    const list = video?.list ? `&list=${encodeURIComponent(video.list)}` : ""
    // The embedded player pauses itself whenever the page is hidden, which is why background
    // audio dies when switching apps in a mobile browser. Handing off to the official app gives
    // real background playback (and proper lock-screen controls). The app needs a tap on its own
    // play button before audio starts — deep links cannot autoplay.
    const target = `youtube://watch?v=${id}${list}`
    const started = Date.now()
    window.location.href = target
    // Only fall back to the website if we never actually left the page. Without this guard the
    // timer also fires after returning from the app and dumps a stray browser tab.
    setTimeout(() => {
      if (document.visibilityState === "visible" && Date.now() - started < 2500) {
        window.open(`https://www.youtube.com/watch?v=${id}${list}`, "_blank", "noopener")
      }
    }, 1200)
  }

  const enterWebPip = async () => {
    try {
      const d = iframeRef.current as any
      if (!d?.requestPictureInPicture) throw new Error("unsupported")
      await d.requestPictureInPicture()
      setPipHint("")
    } catch {
      setPipHint(
        "This browser cannot float the video. For background audio use the phone button to open it in the YouTube app.",
      )
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
      controls: "1",
      fs: "1",
    })
    // The IFrame API needs the embedding origin, otherwise the player can load without its
    // full controls and silently ignore postMessage commands.
    if (typeof window !== "undefined" && window.location?.origin) {
      q.set("origin", window.location.origin)
    }
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

  const videoIdNow = video?.id || currentId.current
  const currentMatch = results.find((r) => r.id === videoIdNow) || null
  const channelName = currentMatch?.channel || "BioPulse Music"
  const savedNow = Boolean(videoIdNow) && saved.some((s) => s.id === videoIdNow)

  const shareNow = async () => {
    const id = video?.id || currentId.current
    if (!id) return
    const url = `https://www.youtube.com/watch?v=${id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: nowTitle, url })
      } else {
        await navigator.clipboard.writeText(url)
        setPipHint("Link copied")
        window.setTimeout(() => setPipHint(""), 1500)
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const toggleSavedNow = () => {
    if (!videoIdNow || videoIdNow === "jfKfPfyJRdk") return
    if (savedNow) {
      removeSaved(videoIdNow)
    } else {
      addToSaved(videoIdNow, nowTitle, video?.list || "")
      loadSaved()
    }
  }

  /** Floats the player so the user can keep doing other things on the phone. */
  const goBackground = () => {
    try {
      ;(window as any).BioPulseBridge?.enterPipMode?.()
    } catch {
      /* browser build: no picture-in-picture activity */
    }
  }

  const pipAction = () => {
    if (inApp) goBackground()
    else void enterWebPip()
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <style>{`
        html.bp-pip, html.bp-pip body { background: #000 !important; overflow: hidden !important; }
        html.bp-pip body * { visibility: hidden !important; }
        html.bp-pip .bp-yt-player, html.bp-pip .bp-yt-player * { visibility: visible !important; }
        html.bp-pip .bp-yt-player {
          position: fixed !important; inset: 0 !important; width: 100vw !important;
          height: 100vh !important; z-index: 2147483647 !important; margin: 0 !important;
        }
        html.bp-pip .bp-yt-player .bp-yt-frame {
          position: fixed !important; inset: 0 !important; width: 100vw !important;
          height: 100vh !important; aspect-ratio: auto !important;
        }
        html.bp-pip .bp-yt-player .bp-yt-ui { display: none !important; }
      `}</style>
      {/* YouTube-style channel bar */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#FF0033] shadow-[0_0_26px_-6px_rgba(255,0,51,0.9)]">
          <Youtube className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight">
            BioPulse <span className="text-[#FF0033]">Tube</span>
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Ad-free · background play · lock-screen seek bar
          </p>
        </div>
        {inApp && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            BG ON
          </span>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Search YouTube…"
            className="h-11 rounded-full border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm placeholder:text-muted-foreground/70 focus-visible:border-[#FF0033]/50 focus-visible:ring-[#FF0033]/40"
          />
        </div>
        <button
          type="button"
          onClick={() => doSearch()}
          disabled={searching}
          aria-label="Search"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#FF0033] text-white shadow-[0_0_24px_-8px_rgba(255,0,51,0.9)] transition-transform active:scale-95 disabled:opacity-60"
        >
          {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        </button>
      </div>

      {/* Category chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              setQuery(c.q)
              if (!c.q) {
                setResults([])
                setSearched("")
                setSearchErr("")
                return
              }
              void doSearch(c.q)
            }}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-[#FF0033]/50 hover:bg-[#FF0033]/10 hover:text-white"
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Player — inline by default, true fullscreen overlay when expanded */}
      {fs && (
        <button
          type="button"
          aria-label="Exit fullscreen"
          onClick={() => setFs(false)}
          className="fixed inset-0 z-[190] h-[100dvh] w-screen cursor-default bg-black"
        />
      )}

      {video && (
        <div className={cn("bp-yt-player", fs ? "fixed inset-0 z-[200] bg-black" : "relative")}>
          {/* Ambient glow behind the player */}
          {!fs && (
            <div className="bp-yt-ui pointer-events-none absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[#FF0033]/45 via-fuchsia-500/25 to-cyan-400/25 opacity-70 blur-2xl" />
          )}
          <div
            className={
              fs
                ? "relative h-[100dvh] w-screen bg-black"
                : "relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_0_50px_-14px_rgba(255,0,51,0.6)]"
            }
          >
            <div className={cn("bp-yt-frame", fs ? "relative h-full w-full" : "relative aspect-video w-full")}>
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
                className="bp-yt-ui absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-95"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="bp-yt-ui absolute right-3 top-3 z-10 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Background / picture in picture"
                  title="Float the video and keep using other apps"
                  onClick={pipAction}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-95"
                >
                  <PictureInPicture2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Listen in the YouTube app"
                  title="Background audio: play in the YouTube app"
                  onClick={openInYouTubeApp}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-95"
                >
                  <Smartphone className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Fullscreen"
                  onClick={() => setFs((v) => !v)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-95"
                >
                  {fs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
              </div>
              {!online && (
                <div className="bp-yt-ui absolute inset-x-0 bottom-0 z-10 bg-black/85 px-3 py-2 text-center text-xs text-white/90">
                  No internet — the video can&apos;t load right now.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {video && !fs && (
        <div className="space-y-3">
          <h2 className="text-[15px] font-semibold leading-snug">{nowTitle}</h2>

          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FF0033] via-rose-500 to-fuchsia-600 text-xs font-bold text-white shadow-[0_0_18px_-6px_rgba(255,0,51,0.9)]">
              {channelName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{channelName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {[currentMatch?.views, currentMatch?.published].filter(Boolean).join(" · ") ||
                  (playing ? "Playing now" : "Paused")}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                playing ? "bg-[#FF0033]/15 text-[#FF6B81]" : "bg-white/10 text-muted-foreground",
              )}
            >
              {playing ? "PLAYING" : "PAUSED"}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={toggleSavedNow}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-foreground/85 transition-colors hover:border-[#FF0033]/50 hover:bg-[#FF0033]/10 active:scale-95"
            >
              {savedNow ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
              {savedNow ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={shareNow}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-foreground/85 transition-colors hover:border-[#FF0033]/50 hover:bg-[#FF0033]/10 active:scale-95"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button
              type="button"
              onClick={pipAction}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-foreground/85 transition-colors hover:border-[#FF0033]/50 hover:bg-[#FF0033]/10 active:scale-95"
            >
              <PictureInPicture2 className="h-3.5 w-3.5" /> Background
            </button>
          </div>

          <p className="flex items-start gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <span className="relative mt-1 flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {inApp
              ? "Background play is on — minimise the app (or tap Background) and keep using the phone. The lock-screen notification shows the glowing seek bar."
              : "Browser tip: YouTube stops this player when the page is hidden. Tap the ⧉ button to float the video, or the 📱 button to open it in the YouTube app, then press play there."}
          </p>
        </div>
      )}

      {pipHint && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
          {pipHint}
        </p>
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
          <h2 className="mb-2.5 flex items-baseline justify-between gap-2 text-sm font-semibold">
            <span className="truncate">
              {video ? "Up next" : `Results for “${searched}”`}
            </span>
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
              {results.length} videos
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => play(r.id, r.title, r.list)}
                className="group relative text-left"
              >
                <div className="relative">
                  {/* Thumbnail glow — sits behind the frame so it reads as a halo, not a border */}
                  <div className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-br from-[#FF0033]/55 via-fuchsia-500/25 to-cyan-400/25 opacity-40 blur-xl transition-opacity duration-300 group-hover:opacity-100 group-active:opacity-100" />
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted ring-1 ring-white/10 transition-all duration-300 group-hover:ring-[#FF0033]/60 group-hover:shadow-[0_0_30px_-10px_rgba(255,0,51,0.95)] group-active:ring-[#FF0033]/60">
                    {r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumb}
                        alt={r.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF0033]/25 to-fuchsia-600/10">
                        <Play className="h-6 w-6 text-white/70" />
                      </div>
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
                    {r.duration && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                        {r.duration}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#FF0033]/90 text-white opacity-0 shadow-[0_0_20px_rgba(255,0,51,0.9)] transition-opacity duration-200 group-hover:opacity-100">
                        <Play className="h-4 w-4 translate-x-[1px]" />
                      </span>
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FF0033] via-rose-500 to-fuchsia-600 text-[10px] font-bold text-white">
                    {(r.channel || "Y").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs font-semibold leading-snug">
                      {r.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {r.channel}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[r.views, r.published].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick picks */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Music2 className="h-4 w-4 text-[#FF0033]" /> Quick picks
        </h2>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {saved.map((s) => {
            const isPreset = Boolean(s.title?.startsWith("🎧"))
            const active = s.id === videoIdNow
            return (
              <div key={s.id} className="group relative w-[152px] shrink-0">
                <button
                  type="button"
                  onClick={() => play(s.id, s.title, s.list || "")}
                  className="w-full text-left"
                >
                  <div className="relative">
                    <div
                      className={cn(
                        "pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-br from-[#FF0033]/55 via-fuchsia-500/25 to-cyan-400/25 blur-xl transition-opacity duration-300",
                        active ? "opacity-100" : "opacity-60 group-hover:opacity-100",
                      )}
                    />
                    <div
                      className={cn(
                        "relative aspect-video overflow-hidden rounded-xl bg-black ring-1 transition-colors",
                        active ? "ring-[#FF0033]/70" : "ring-white/10 group-hover:ring-[#FF0033]/60",
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#FF0033]/30 to-fuchsia-700/20" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`}
                        alt={s.title || "Video"}
                        className="relative h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                        }}
                      />
                      <span className="absolute inset-0 grid place-items-center">
                        <span
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-full text-white shadow-[0_0_18px_rgba(255,0,51,0.9)] transition-opacity",
                            active
                              ? "bg-[#FF0033] opacity-100"
                              : "bg-[#FF0033]/85 opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <Play className="h-4 w-4 translate-x-[1px]" />
                        </span>
                      </span>
                      {active && playing && (
                        <span className="absolute bottom-1 left-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#FF6B81]">
                          Playing
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug",
                      active ? "text-white" : "text-foreground/85",
                    )}
                  >
                    {s.title || "Video"}
                  </p>
                </button>
                {!isPreset && (
                  <button
                    type="button"
                    aria-label="Remove from quick picks"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSaved(s.id)
                    }}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white/80 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/90 hover:text-white active:scale-95"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Optional "paste a link" */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
              className="flex-1 rounded-full border-white/10 bg-white/[0.06]"
            />
            <Button
              variant="outline"
              onClick={readClipboard}
              type="button"
              title="Paste from clipboard"
              className="rounded-full"
            >
              <Link2 className="h-4 w-4" />
              {copied ? "Copied" : "Paste"}
            </Button>
            <Button onClick={onPastePlay} type="button" variant="destructive" className="rounded-full">
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