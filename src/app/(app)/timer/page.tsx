"use client"

import React from "react"
import { useSession } from "next-auth/react"
import { Pause, Play, Timer as TimerIcon } from "lucide-react"

const LIVE_KEY = "bp_timer_live_v1"
const QUEUE_KEY = "bp_worklog_queue_v1"

interface Live {
  running: boolean
  startedAt: number
  accum: number
  label: string
}

interface QueueItem {
  date: string
  minutes: number
  note?: string
}

function todayStr(): string {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mo}-${da}`
}

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const o = JSON.parse(raw)
    return Array.isArray(o) ? o.filter((x) => typeof x === "object" && x !== null) : []
  } catch {
    return []
  }
}

function saveQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* ignore */
  }
}

async function postWorkLog(minutes: number, note?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/work-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayStr(), minutes, note }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function flushWorkLogQueue() {
  let q = loadQueue()
  if (!q.length) return
  const remaining: QueueItem[] = []
  for (const it of q) {
    const ok = await postWorkLog(it.minutes, it.note)
    if (!ok) remaining.push(it)
  }
  saveQueue(remaining)
}

function loadLive(): Live | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (typeof o !== "object" || o === null) return null
    if (typeof o.accum !== "number") return null
    return {
      running: !!o.running,
      startedAt: Number(o.startedAt) || 0,
      accum: Number(o.accum) || 0,
      label: String(o.label || ""),
    }
  } catch {
    return null
  }
}

function saveLive(l: Live) {
  try {
    localStorage.setItem(LIVE_KEY, JSON.stringify(l))
  } catch {
    /* ignore */
  }
}

function bridge(json: Record<string, unknown>) {
  try {
    const b = (window as any).BioPulseBridge
    if (b && typeof b.timerState === "function") b.timerState(JSON.stringify(json))
  } catch {
    /* not in the Android shell */
  }
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = String(sec).padStart(2, "0")
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`
  return `${m}:${ss}`
}

export default function TimerPage() {
  const { status: sessionStatus } = useSession()
  const [elapsed, setElapsed] = React.useState(0)
  const [running, setRunning] = React.useState(false)
  const [accum, setAccum] = React.useState(0)
  const [startedAt, setStartedAt] = React.useState(0)
  const [label, setLabel] = React.useState("")
  const [savedFlash, setSavedFlash] = React.useState(false)
  const [queuedFlash, setQueuedFlash] = React.useState(false)
  const runningRef = React.useRef(false)
  const accumRef = React.useRef(0)
  const startedAtRef = React.useRef(0)
  const labelRef = React.useRef("")

  React.useEffect(() => {
    runningRef.current = running
  }, [running])
  React.useEffect(() => {
    accumRef.current = accum
  }, [accum])
  React.useEffect(() => {
    startedAtRef.current = startedAt
  }, [startedAt])
  React.useEffect(() => {
    labelRef.current = label
  }, [label])

  const currentElapsed = React.useCallback((): number => {
    let e = accumRef.current
    if (runningRef.current && startedAtRef.current > 0) e += Date.now() - startedAtRef.current
    return e
  }, [])

  React.useEffect(() => {
    const l = loadLive()
    if (!l) return
    setLabel(l.label || "")
    setAccum(l.accum)
    accumRef.current = l.accum
    if (l.running && l.startedAt > 0) {
      setStartedAt(l.startedAt)
      startedAtRef.current = l.startedAt
      runningRef.current = true
      setRunning(true)
    } else {
      setElapsed(l.accum)
    }
    flushWorkLogQueue()
    const onOnline = () => flushWorkLogQueue()
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [])

  // Once an auth session is available, retry any work-log entries that were
  // queued while offline or signed out.
  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      flushWorkLogQueue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  React.useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setElapsed(currentElapsed()), 250)
    return () => window.clearInterval(t)
  }, [running, currentElapsed])

  // Auto-save elapsed study time to the Work Log when a run is stopped.
  // Each run is archived once.
  const saveRun = React.useCallback(
    async (elapsedMs: number): Promise<boolean> => {
      if (elapsedMs < 60_000) return false
      const minutes = Math.max(1, Math.floor(elapsedMs / 60_000))
      const note = (labelRef.current || "").slice(0, 200) || undefined
      const ok = await postWorkLog(minutes, note)
      if (ok) {
        flushWorkLogQueue()
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 3500)
        return true
      }
      const q = loadQueue()
      q.push({ date: todayStr(), minutes, note })
      saveQueue(q)
      setQueuedFlash(true)
      window.setTimeout(() => setQueuedFlash(false), 3500)
      return false
    },
    [],
  )

  const pushNative = React.useCallback((live: Live) => {
    bridge({ running: live.running, startedAt: live.startedAt, accum: live.accum, label: live.label })
  }, [])

  const persist = React.useCallback(
    (live: Live) => {
      saveLive(live)
      pushNative(live)
    },
    [pushNative],
  )

  React.useEffect(() => {
    ;(window as any).__bp_timer = (action: string, payload: number) => {
      if (action === "paused") {
        const a = typeof payload === "number" && payload >= 0 ? payload : currentElapsed()
        runningRef.current = false
        startedAtRef.current = 0
        accumRef.current = a
        setRunning(false)
        setStartedAt(0)
        setAccum(a)
        setElapsed(a)
        saveLive({ running: false, startedAt: 0, accum: a, label: labelRef.current })
      } else if (action === "resumed") {
        const s = typeof payload === "number" && payload > 0 ? payload : Date.now()
        runningRef.current = true
        startedAtRef.current = s
        setRunning(true)
        setStartedAt(s)
        saveLive({ running: true, startedAt: s, accum: accumRef.current, label: labelRef.current })
      } else if (action === "stopped") {
        const e = typeof payload === "number" && payload > 0 ? payload : currentElapsed()
        runningRef.current = false
        startedAtRef.current = 0
        accumRef.current = 0
        setRunning(false)
        setStartedAt(0)
        setAccum(0)
        setElapsed(0)
        saveLive({ running: false, startedAt: 0, accum: 0, label: labelRef.current })
        saveRun(e)
      }
    }
    return () => {
      delete (window as any).__bp_timer
    }
  }, [currentElapsed, saveRun])

  const start = () => {
    accumRef.current = 0
    startedAtRef.current = Date.now()
    runningRef.current = true
    setAccum(0)
    setStartedAt(startedAtRef.current)
    setElapsed(0)
    setRunning(true)
    persist({ running: true, startedAt: startedAtRef.current, accum: 0, label: labelRef.current })
  }

  const pause = () => {
    const e = currentElapsed()
    runningRef.current = false
    startedAtRef.current = 0
    accumRef.current = e
    setRunning(false)
    setStartedAt(0)
    setAccum(e)
    setElapsed(e)
    persist({ running: false, startedAt: 0, accum: e, label: labelRef.current })
  }

  const resume = () => {
    const s = Date.now()
    startedAtRef.current = s
    runningRef.current = true
    setRunning(true)
    setStartedAt(s)
    persist({ running: true, startedAt: s, accum: accumRef.current, label: labelRef.current })
  }

  const stop = () => {
    const e = currentElapsed()
    runningRef.current = false
    startedAtRef.current = 0
    accumRef.current = 0
    setRunning(false)
    setStartedAt(0)
    setAccum(0)
    setElapsed(0)
    persist({ running: false, startedAt: 0, accum: 0, label: labelRef.current })
    saveRun(e)
  }

  React.useEffect(() => {
    if (!runningRef.current) return
    const t = window.setInterval(() => {
      pushNative({
        running: true,
        startedAt: startedAtRef.current,
        accum: accumRef.current,
        label: labelRef.current,
      })
    }, 5000)
    return () => window.clearInterval(t)
  }, [running, pushNative])

  const pausedState = !running && accum > 0

  const statusText = running ? "Running" : pausedState ? "Paused" : "Ready"

  const digitalBtnBase =
    "inline-flex items-center justify-center gap-2 rounded-xl border-2 px-6 py-3 font-mono text-base font-bold uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100"

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 p-4 pb-24 md:p-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-emerald-400">
        <TimerIcon className="h-5 w-5" />
        Study Timer
      </h1>

      <div
        className={`rounded-2xl bg-black p-8 text-center ring-2 ${
          running ? "ring-emerald-400/50 shadow-[0_0_40px_rgba(16,185,129,0.25)]" : "ring-emerald-900/50"
        }`}
      >
        <div
          className={`mx-auto inline-block rounded-xl bg-[#050A08] px-6 py-4 font-mono text-7xl font-bold tabular-nums tracking-tight ring-1 ring-white/10 ${
            running || (pausedState && accum > 0)
              ? "text-red-500 [text-shadow:0_0_18px_rgba(239,68,68,0.9)]"
              : "text-[#0F0] [text-shadow:0_0_18px_rgba(0,255,0,0.7)]"
          }`}
        >
          {fmt(elapsed)}
        </div>
        <div className="mt-4 font-mono text-sm uppercase tracking-[0.4em] text-emerald-700">{statusText}</div>
        {savedFlash && (
          <div className="mt-3 font-mono text-xs uppercase tracking-widest text-emerald-400">✔ Saved to Work Log</div>
        )}
        {queuedFlash && (
          <div className="mt-3 font-mono text-xs uppercase tracking-widest text-amber-400">⏳ Saved locally — will sync when online</div>
        )}
        {label && <div className="mt-1 text-base text-white">{label}</div>}
        {running && (
          <div className="mx-auto mt-3 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)]" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        {running ? (
          <button onClick={pause} className={`${digitalBtnBase} border-amber-400/70 bg-black text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.25)]`}>
            <Pause className="h-5 w-5" /> Pause
          </button>
        ) : pausedState ? (
          <button onClick={resume} className={`${digitalBtnBase} border-emerald-400/70 bg-black text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.25)]`}>
            <Play className="h-5 w-5" /> Start
          </button>
        ) : (
          <button
            onClick={start}
            className={`${digitalBtnBase} border-emerald-400/70 bg-black text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.25)]`}
          >
            <Play className="h-5 w-5" /> Start
          </button>
        )}
        {(running || pausedState) && (
          <button
            onClick={stop}
            className={`${digitalBtnBase} border-red-500/60 bg-black text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.2)]`}
          >
            Stop
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-[#0B1B16] p-5 ring-1 ring-emerald-900/40">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={running}
          className="w-full rounded-lg bg-black/40 px-3 py-2 text-white outline-none disabled:opacity-40"
          placeholder={label ? undefined : "Label (optional) — saved with today's work log"}
        />
        <p className="mt-3 text-xs text-emerald-700">
          No timing to set — just press Start. It runs as long as you want (unlimited, counts up). Press Stop and
          today&apos;s studied time saves to your Work Log automatically.
        </p>
      </div>

      <p className="text-center text-xs text-emerald-700">
        Runs in the background with a live notification on your lock screen.
      </p>
    </div>
  )
}