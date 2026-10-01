"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { callIdFor } from "@/lib/call-signal";

type CallState =
  | "idle"
  | "requesting"        // we asked them, waiting for answer
  | "incoming"          // they asked us
  | "connecting"        // accepted, negotiating WebRTC
  | "active"
  | "ended";

type SignalKind = "hello" | "offer" | "answer" | "ice" | "accept" | "decline" | "bye";

type SignalPayload = {
  kind: SignalKind;
  sdp?: RTCSessionDescriptionInit | null;
  ice?: RTCIceCandidateInit | null;
};

export interface CallPeer {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface VideoCallOverlayProps {
  /** null = closed */
  peer: CallPeer | null;
  selfId: string;
  selfName: string;
  selfAvatar?: string | null;
  role: "caller" | "callee";
  onClose: () => void;
}

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function VideoCallOverlay({
  peer,
  selfId,
  selfName,
  selfAvatar,
  role,
  onClose,
}: VideoCallOverlayProps) {
  const [state, setState] = React.useState<CallState>("idle");
  const [muted, setMuted] = React.useState(false);
  const [camOff, setCamOff] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [connectingMsg, setConnectingMsg] = React.useState("");

  const localRef = React.useRef<HTMLVideoElement>(null);
  const remoteRef = React.useRef<HTMLVideoElement>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const callIdRef = React.useRef<string | null>(null);
  const peerIdRef = React.useRef<string | null>(null);
  const pendingIceRef = React.useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = React.useRef(false);
  const startedAtRef = React.useRef<number>(0);
  const tickRef = React.useRef<number | null>(null);
  const retryTimerRef = React.useRef<number | null>(null);
  const pollTimerRef = React.useRef<number | null>(null);
  const closedRef = React.useRef(false);

  const peerId = peer?.id ?? null;
  const peerName = peer?.name ?? "";
  const isOpen = !!peer;

  /* ------------------------------------------------------------------ */
  /* Lifecycle: start media + signalling whenever the overlay opens      */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!isOpen || !peerId) {
      teardown();
      return;
    }
    peerIdRef.current = peerId;
    closedRef.current = false;

    // 1) Get local camera/mic
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localRef.current) {
          localRef.current.srcObject = stream;
          await localRef.current.play().catch(() => {});
        }
        setError(null);
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera & microphone permission denied."
            : "Could not access camera/microphone."
        );
      }
    })();

    // 2) Signalling. Supabase realtime does not resolve in DNS, so signals are
    //    relayed over the app DB and polled.
    const callId = callIdFor(selfId, peerId);
    callIdRef.current = callId;
    setState(role === "caller" ? "requesting" : "incoming");

    // Caller offers immediately and retries — the callee's overlay may not be
    // mounted yet, and a polling relay has no queue for late joiners.
    if (role === "caller") {
      void sendOffer();
      retryTimerRef.current = window.setInterval(() => {
        if (closedRef.current || pcRef.current?.connectionState === "connected") {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          return;
        }
        void sendOffer();
      }, 2500);
    } else {
      void send({ kind: "hello" });
    }

    pollTimerRef.current = window.setInterval(() => void pullSignals(), 1000);
    void pullSignals();

    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, peerId, selfId, role]);

  /* ------------------------------------------------------------------ */
  /* Signalling — relayed over the app DB                                */
  /* ------------------------------------------------------------------ */
  const send = React.useCallback(async (payload: SignalPayload) => {
    const to = peerIdRef.current;
    const callId = callIdRef.current;
    if (!to || !callId) return;
    try {
      await fetch("/api/chat/call-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          toId: to,
          kind: payload.kind,
          sdp: payload.sdp ?? null,
          ice: payload.ice ?? null,
        }),
      });
    } catch {
      /* transient network error — the caller retries */
    }
  }, []);

  const pullSignals = React.useCallback(async () => {
    const callId = callIdRef.current;
    const peerId = peerIdRef.current;
    if (!callId || !peerId || closedRef.current) return;
    try {
      const res = await fetch(
        `/api/chat/call-signal?callId=${encodeURIComponent(callId)}&partnerId=${encodeURIComponent(peerId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        signals?: {
          id: string;
          from: string;
          callId: string;
          kind: SignalKind;
          sdp: RTCSessionDescriptionInit | null;
          ice: RTCIceCandidateInit | null;
        }[];
      };
      for (const sig of data.signals || []) {
        if (sig.callId !== callId) continue;
        await handleSignal({
          kind: sig.kind,
          sdp: sig.sdp,
          ice: sig.ice,
        });
      }
    } catch {
      /* ignore polling errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensurePc = React.useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(ICE);

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ kind: "ice", ice: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      remoteStreamRef.current = stream;
      if (remoteRef.current) {
        remoteRef.current.srcObject = stream;
        remoteRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        setState("active");
        startedAtRef.current = Date.now();
      } else if (s === "failed") {
        setState("ended");
      } else if (s === "disconnected") {
        setTimeout(() => {
          if (!closedRef.current && pcRef.current?.connectionState === "disconnected") {
            setState("ended");
          }
        }, 4000);
      }
    };

    // Attach local tracks once the PC exists.
    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((t) => {
        if (t.kind === "audio") pc.addTrack(t, local);
        else if (t.kind === "video") pc.addTrack(t, local);
      });
    } else {
      // Media may resolve after the PC is created — attach when it lands.
      const iv = setInterval(() => {
        const s = localStreamRef.current;
        if (!s || closedRef.current) {
          clearInterval(iv);
          return;
        }
        s.getTracks().forEach((t) => {
          if (t.kind === "audio") pc.addTrack(t, s);
          else if (t.kind === "video") pc.addTrack(t, s);
        });
        clearInterval(iv);
      }, 250);
    }

    pcRef.current = pc;
    return pc;
  }, [send]);

  const drainIce = React.useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
  }, []);

  const sendOffer = React.useCallback(async () => {
    const pc = ensurePc();
    if (makingOfferRef.current) return;
    makingOfferRef.current = true;
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      setConnectingMsg("Ringing…");
      await send({ kind: "offer", sdp: offer });
    } finally {
      makingOfferRef.current = false;
    }
  }, [ensurePc, send]);

  const handleSignal = React.useCallback(
    async (sig: SignalPayload) => {
      const pc = ensurePc();

      if (sig.kind === "decline" || sig.kind === "bye") {
        setState("ended");
        return;
      }

      if (sig.kind === "hello" && role === "caller") {
        // Callee just joined — offer again so they receive a fresh one.
        await sendOffer();
        return;
      }

      if (sig.kind === "accept") {
        setConnectingMsg("Connecting…");
        setState("connecting");
        await sendOffer();
        return;
      }

      if (sig.kind === "offer" && sig.sdp) {
        const desc = sig.sdp;
        const collision =
          pc.signalingState !== "stable" && makingOfferRef.current;

        if (collision) {
          // Impolite peer: drop the incoming offer and let the retry land.
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        await drainIce(pc);
        setConnectingMsg("Connecting…");
        setState("connecting");

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send({ kind: "answer", sdp: answer });
        return;
      }

      if (sig.kind === "answer" && sig.sdp) {
        if (pc.signalingState !== "have-local-offer") {
          // Late/duplicate answer — our retry already replaced the offer.
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        await drainIce(pc);
        setConnectingMsg("Connecting…");
        setState("connecting");
        return;
      }

      if (sig.kind === "ice" && sig.ice) {
        if (pc.remoteDescription?.type) {
          try {
            await pc.addIceCandidate(sig.ice);
          } catch {
            /* stale candidate */
          }
        } else {
          pendingIceRef.current.push(sig.ice);
        }
      }
    },
    [drainIce, ensurePc, role, send, sendOffer]
  );

  const teardown = React.useCallback(() => {
    closedRef.current = true;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;
    callIdRef.current = null;
    setState("idle");
    setElapsed(0);
  }, []);

  const hangUp = React.useCallback(async () => {
    await send({ kind: "bye" });
    teardown();
    onClose();
  }, [send, teardown, onClose]);

  /* ------------------------------------------------------------------ */
  /* Elapsed timer                                                       */
  /* ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (state !== "active") return;
    startedAtRef.current = Date.now();
    setElapsed(0);
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state]);

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */
  const toggleMute = React.useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !muted;
    tracks.forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCam = React.useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const next = !camOff;
    tracks.forEach((t) => (t.enabled = !next));
    setCamOff(next);
  }, [camOff]);

  const accept = React.useCallback(async () => {
    // The caller re-offers on its retry timer once it sees this accept, so we
    // only need to flip into the connecting state and answer the next offer.
    setState("connecting");
    setConnectingMsg("Connecting…");
    await send({ kind: "accept" });
  }, [send]);

  const decline = React.useCallback(async () => {
    await send({ kind: "decline" });
    teardown();
    onClose();
  }, [send, teardown, onClose]);

  if (!isOpen) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const showRemote = state === "active";

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in bg-black">
      {/* Remote stage */}
      <div className="absolute inset-0">
        <video
          ref={remoteRef}
          playsInline
          autoPlay
          className={cn(
            "h-full w-full object-cover transition-opacity duration-700 ease-premium",
            showRemote ? "opacity-100" : "opacity-0"
          )}
        />

        {/* Ambient backdrop while connecting / no remote stream yet */}
        <div
          className={cn(
            "absolute inset-0 bg-dots transition-opacity duration-700",
            showRemote ? "pointer-events-none opacity-0" : "opacity-100"
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(6,182,212,0.14),transparent_60%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />

          <div className="relative flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            {/* Avatar with pulsing rings */}
            <div className="relative">
              {state !== "ended" && (
                <>
                  <span className="absolute inset-0 animate-ring-expand rounded-full border-2 border-primary/40" />
                  <span
                    className="absolute inset-0 animate-ring-expand rounded-full border-2 border-primary/30"
                    style={{ animationDelay: "0.6s" }}
                  />
                </>
              )}
              <div className="relative grid h-28 w-28 place-items-center rounded-full bg-gradient-primary text-4xl font-bold text-primary-foreground shadow-2xl">
                {peer?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={peer.avatar}
                    alt={peerName}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  peerName.charAt(0).toUpperCase() || "?"
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
                {peerName}
              </h2>
              <p className="text-sm text-white/60">
                {state === "ended"
                  ? "Call ended"
                  : state === "connecting"
                    ? connectingMsg || "Connecting…"
                    : state === "incoming"
                      ? "Incoming video call"
                      : error
                        ? "Camera unavailable"
                        : "Starting call…"}
              </p>
            </div>

            {error && (
              <p className="max-w-xs rounded-lg border border-destructive/30 bg-destructive/15 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            {/* Ringing / connecting indicator */}
            {(state === "connecting" || state === "incoming" || state === "requesting") && (
              <div className="flex h-8 items-end gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-1 rounded-full bg-primary",
                      i % 3 === 0 ? "animate-wave-1" : i % 3 === 1 ? "animate-wave-2" : "animate-wave-3"
                    )}
                    style={{ height: "100%" }}
                  />
                ))}
              </div>
            )}

            {/* Incoming: accept / decline */}
            {state === "incoming" && (
              <div className="mt-2 flex items-center gap-4">
                <button
                  onClick={decline}
                  className="pressable grid h-16 w-16 place-items-center rounded-full bg-destructive text-white shadow-2xl transition-transform hover:scale-105"
                  aria-label="Decline call"
                >
                  <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg] fill-current">
                    <path d="M21 15.5c-1.25 0-2.45-.2-3.57-.57a.84.84 0 0 0-.92.31c-.26.42-.2.92.14 1.29l1.44 1.44a15.06 15.06 0 0 1-6.59 6.59l-1.44-1.44a1 1 0 0 0-1.29-.14c-.57.24-.93.75-.93 1.35V19c0 1.1.9 2 2 2 8.84 0 16-7.16 16-16 0-1.1-.9-2-2-2h-.34z" />
                  </svg>
                </button>
                <button
                  onClick={accept}
                  className="pressable grid h-16 w-16 place-items-center rounded-full bg-success text-white shadow-2xl transition-transform hover:scale-105 hover:shadow-[0_0_40px_hsl(var(--success)/0.6)]"
                  aria-label="Accept call"
                >
                  <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg] fill-current">
                    <path d="M21 15.5c-1.25 0-2.45-.2-3.57-.57a.84.84 0 0 0-.92.31c-.26.42-.2.92.14 1.29l1.44 1.44a15.06 15.06 0 0 1-6.59 6.59l-1.44-1.44a1 1 0 0 0-1.29-.14c-.57.24-.93.75-.93 1.35V19c0 1.1.9 2 2 2 8.84 0 16-7.16 16-16 0-1.1-.9-2-2-2h-.34z" />
                  </svg>
                </button>
              </div>
            )}

            {state === "ended" && (
              <button
                onClick={onClose}
                className="pressable rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 animate-fade-down bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white drop-shadow">{peerName}</p>
            {state === "active" ? (
              <p className="flex items-center gap-1.5 text-sm tabular-nums text-white/70">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                {mm}:{ss}
              </p>
            ) : (
              <p className="text-sm text-white/55">
                {state === "incoming"
                  ? "Incoming call"
                  : state === "ended"
                    ? "Call ended"
                    : "Calling…"}
              </p>
            )}
          </div>

          {/* Quality indicator */}
          {state === "active" && (
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-2xs font-semibold text-white/80 backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              HD
            </div>
          )}
        </div>
      </div>

      {/* Self preview (PiP) */}
      <div
        className={cn(
          "absolute z-10 transition-all duration-500 ease-premium",
          "bottom-32 right-3 w-24 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl sm:bottom-28 sm:right-6 sm:w-32",
          state === "active" && "scale-100 opacity-100"
        )}
      >
        <div className="relative aspect-[3/4] w-full">
          <video
            ref={localRef}
            playsInline
            autoPlay
            muted
            className={cn(
              "h-full w-full scale-x-[-1] object-cover transition-opacity duration-300",
              camOff ? "opacity-0" : "opacity-100"
            )}
          />
          {camOff && (
            <div className="absolute inset-0 grid place-items-center bg-elevated">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                {selfName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span className="absolute bottom-1 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
            You
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 animate-fade-up bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16 sm:px-6">
        <div className="mx-auto flex max-w-md items-center justify-center gap-4">
          {/* Mute */}
          <CallButton
            active={muted}
            onClick={toggleMute}
            label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </CallButton>

          {/* Camera */}
          <CallButton
            active={camOff}
            onClick={toggleCam}
            label={camOff ? "Camera on" : "Camera off"}
          >
            {camOff ? <VideoOffIcon /> : <VideoIcon />}
          </CallButton>

          {/* End (or accept/decline handled above) */}
          {state === "active" || state === "connecting" ? (
            <button
              onClick={hangUp}
              aria-label="End call"
              className="pressable grid h-16 w-16 place-items-center rounded-full bg-destructive text-white shadow-2xl transition-all duration-200 hover:scale-105 hover:shadow-[0_0_40px_hsl(var(--destructive)/0.65)]"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg] fill-current">
                <path d="M21 15.5c-1.25 0-2.45-.2-3.57-.57a.84.84 0 0 0-.92.31c-.26.42-.2.92.14 1.29l1.44 1.44a15.06 15.06 0 0 1-6.59 6.59l-1.44-1.44a1 1 0 0 0-1.29-.14c-.57.24-.93.75-.93 1.35V19c0 1.1.9 2 2 2 8.84 0 16-7.16 16-16 0-1.1-.9-2-2-2h-.34z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={hangUp}
              aria-label="Cancel"
              className="pressable grid h-16 w-16 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:scale-105 hover:bg-white/25"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg] fill-current">
                <path d="M21 15.5c-1.25 0-2.45-.2-3.57-.57a.84.84 0 0 0-.92.31c-.26.42-.2.92.14 1.29l1.44 1.44a15.06 15.06 0 0 1-6.59 6.59l-1.44-1.44a1 1 0 0 0-1.29-.14c-.57.24-.93.75-.93 1.35V19c0 1.1.9 2 2 2 8.84 0 16-7.16 16-16 0-1.1-.9-2-2-2h-.34z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Pieces                                                               */
/* -------------------------------------------------------------------- */
function CallButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "pressable grid h-14 w-14 place-items-center rounded-full border backdrop-blur-md transition-all duration-200",
        active
          ? "border-white bg-white text-black shadow-xl"
          : "border-white/20 bg-white/10 text-white hover:bg-white/20"
      )}
    >
      {children}
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M3 3.1 21.9 22 20.5 23.4 17 19.9A7 7 0 0 1 11 21v-2.1a5 5 0 0 1-3.9-1.9l-1.4-1.4L3 13.2A7 7 0 0 0 11 18c.7 0 1.4-.1 2-.3l-2-2H9v-.2l9.9 9.9 1.5-1.5L3 2.6 4.5 1.1 8 4.6V11a3 3 0 0 0 4.6 2.5l-1.4-1.4A1 1 0 0 1 10 11V6.2L7.1 3.3A3 3 0 0 1 15 5v6c0 .3 0 .6-.1.9L8 5V5c0-.2 0-.3.1-.5L3 1.1z" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M4 5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm12.5 3.5 3-2.3A1 1 0 0 1 21 7v10a1 1 0 0 1-1.5.9l-3-2.3v-1.6z" />
    </svg>
  );
}
function VideoOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <path d="M21 6.5 17.5 9 15 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2.5l2.5 1.9V8a1 1 0 0 0-.5-.9zM4 5h9a2 2 0 0 1 2 2v.6L5.6 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9c.4 0 .8-.1 1.1-.3l-1.6-1.6a1 1 0 0 1-.5.1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  );
}