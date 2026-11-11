"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

export type LightboxMedia = {
  url: string;
  type: string | null;
  name?: string | null;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function touchDistance(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Full-screen media viewer. Tapping an image or video in a chat opens it here, centred, with
 * pinch / double-tap zoom and drag-to-pan (plus +/- for devices without pinch). Videos play
 * with native controls. Rendered as a fixed overlay so it sits above the chat composer.
 */
export function MediaLightbox({
  media,
  onClose,
}: {
  media: LightboxMedia | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const gesture = useRef<{
    mode: "none" | "pan" | "pinch";
    startDistance: number;
    startScale: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>({ mode: "none", startDistance: 0, startScale: 1, startX: 0, startY: 0, lastX: 0, lastY: 0 });
  const lastTap = useRef(0);
  // `onClose` is re-created by the chat page on every render (and it re-renders on every poll
  // tick). Keeping it in a ref stops the effect below from re-running — and resetting the zoom
  // the user just applied — several times a minute.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const isImage = media?.type === "image";
  const isVideo = media?.type === "video";

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Every new media starts un-zoomed, and Escape closes.
  useEffect(() => {
    reset();
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [media, reset]);

  if (!media) return null;

  const zoomBy = (delta: number) => {
    setScale((s) => {
      const next = clamp(s + delta, MIN_SCALE, MAX_SCALE);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (e.touches.length === 2) {
      g.mode = "pinch";
      g.startDistance = touchDistance(e.touches[0], e.touches[1]);
      g.startScale = scale;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      g.mode = "pan";
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      // Double tap toggles between fit and 2.5x (mobile has no dblclick).
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (scale > 1) {
          reset();
        } else {
          setScale(2.5);
        }
        g.mode = "none";
      } else {
        lastTap.current = now;
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (g.mode === "pinch" && e.touches.length === 2) {
      const next = clamp(
        (g.startScale * touchDistance(e.touches[0], e.touches[1])) / (g.startDistance || 1),
        MIN_SCALE,
        MAX_SCALE,
      );
      setScale(next);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return;
    }
    if (g.mode === "pan" && e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      setOffset((o) => ({ x: o.x + (t.clientX - g.lastX), y: o.y + (t.clientY - g.lastY) }));
      g.lastX = t.clientX;
      g.lastY = t.clientY;
    }
  };

  const endGesture = () => {
    gesture.current.mode = "none";
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={media.name || (isVideo ? "Video" : "Image")}
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 text-white/90">
        <span className="truncate pr-3 text-xs font-medium text-white/70">
          {media.name || (isVideo ? "Video" : "Photo")}
        </span>
        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => zoomBy(-0.5)}
                aria-label="Zoom out"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 active:bg-white/20"
              >
                <Minus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(0.5)}
                aria-label="Zoom in"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 active:bg-white/20"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={reset}
                aria-label="Reset zoom"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 active:bg-white/20"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 active:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endGesture}
        onTouchCancel={endGesture}
        onClick={(e) => {
          // Tap the empty area (not the media itself) to dismiss.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {isVideo ? (
          <video
            src={media.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={media.name || "image"}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform duration-100"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}
