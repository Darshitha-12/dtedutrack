"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_SOUND_TYPES,
  CUSTOM_SOUND_PREFIX,
  SOUNDS_CHANGED_EVENT,
  SoundTooLargeError,
  addCustomSound,
  deleteCustomSound,
  formatBytes,
  formatDuration,
  getCustomSoundUrl,
  listCustomSounds,
  revokeSoundUrl,
  type CustomSoundMeta,
} from "@/features/alarms/lib/custom-sounds";
import { AudioEngine, type AlarmSound } from "@/features/alarms/lib/audio-engine";
import { nativeBridge } from "@/lib/native-shell";
import { Music, Plus, Play, Square, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BUILT_INS = [
  { value: "chime", label: "Crystal Chimes" },
  { value: "digital", label: "Digital Buzzer" },
  { value: "bio", label: "Bio-Alert Sweep" },
];

interface SoundPickerProps<T extends string = string> {
  value: T;
  onChange: (sound: T) => void;
  className?: string;
}

export function SoundPicker<T extends string = string>({
  value,
  onChange,
  className,
}: SoundPickerProps<T>) {
  const [sounds, setSounds] = useState<CustomSoundMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listCustomSounds();
      setSounds(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(SOUNDS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SOUNDS_CHANGED_EVENT, onChanged);
  }, [refresh]);

  useEffect(() => {
    // Leaving the picker should not leave a preview running.
    return () => AudioEngine.stop();
  }, []);

  const totalBytes = sounds.reduce((sum, s) => sum + s.size, 0);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setUploading(true);
      let added = 0;
      for (const file of Array.from(files)) {
        try {
          await addCustomSound(file);
          added += 1;
        } catch (err) {
          if (err instanceof SoundTooLargeError) setError(err.message);
          else setError(`Could not add "${file.name}".`);
        }
      }
      setUploading(false);
      if (added > 0) {
        setStatus(`Added ${added} sound${added > 1 ? "s" : ""}`);
        setTimeout(() => setStatus(null), 3000);
      }
      if (fileRef.current) fileRef.current.value = "";
    },
    [],
  );

  const stopPreview = useCallback(() => {
    AudioEngine.stop();
    setPreviewing(null);
  }, []);

  /**
 * Plays a sample so the user hears the sound the moment they pick it.
 *
 * <p>Routed through the audio engine — the same code path an alarm uses — rather than a bare
 * `Audio` element, so a custom sound behaves here exactly as it will when the alarm goes off.
 */
  const previewSound = useCallback((sound: string) => {
    stopPreview();
    try {
      // Web Audio stays muted without audio focus on this WebView, so ask the native side to hold
      // alarm focus for the length of the preview.
      nativeBridge()?.previewSound?.();
    } catch {
      /* browser build: no focus to ask for */
    }
    AudioEngine.preview(sound as AlarmSound);
    setPreviewing(sound);
    // The engine stops itself; this only clears the button state to match.
    const builtIn = !sound.startsWith(CUSTOM_SOUND_PREFIX);
    setTimeout(() => {
      setPreviewing((cur) => (cur === sound ? null : cur));
    }, builtIn ? 2500 : 6000);
  }, [stopPreview]);

  const preview = useCallback(
    async (meta: CustomSoundMeta) => {
      setError(null);
      const same = previewing === meta.id;
      if (same) {
        stopPreview();
        AudioEngine.stop();
        return;
      }
      try {
        const url = await getCustomSoundUrl(meta.id);
        if (!url) {
          setError(`"${meta.name}" is no longer available.`);
          return;
        }
        revokeSoundUrl(meta.id);
        previewSound(`${CUSTOM_SOUND_PREFIX}${meta.id}`);
      } catch {
        setError(`Cannot play "${meta.name}" on this device.`);
      }
    },
    [previewing, previewSound, stopPreview],
  );

  const remove = useCallback(
    async (meta: CustomSoundMeta) => {
      stopPreview();
      revokeSoundUrl(meta.id);
      await deleteCustomSound(meta.id);
      setSounds((prev) => prev.filter((s) => s.id !== meta.id));
      if (value === `${CUSTOM_SOUND_PREFIX}${meta.id}`) onChange("chime" as T);
    },
    [onChange, stopPreview, value],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className={cn("space-y-2", className)}>
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value as T;
          onChange(next);
          previewSound(next as string);
        }}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
      >
        <optgroup label="Built-in">
          {BUILT_INS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </optgroup>
        {sounds.length > 0 && (
          <optgroup label={`My sounds (${sounds.length})`}>
            {sounds.map((s) => (
              <option key={s.id} value={`${CUSTOM_SOUND_PREFIX}${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPTED_SOUND_TYPES}
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-transparent px-3 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          {uploading ? "Adding..." : "Add MP3 / audio"}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {loading
            ? "Loading library..."
            : sounds.length === 0
              ? "No custom sounds yet"
              : `${sounds.length} saved · ${formatBytes(totalBytes)}`}
        </span>
      </div>

      <div
        onDragOver={onDragOver}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer?.files ?? null);
        }}
        className="rounded-lg border border-dashed border-border/70 p-2"
      >
        {sounds.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            Drop audio files here, or use the button above. There is no limit on
            how many you can add.
          </p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {sounds.map((s) => {
              const id = `${CUSTOM_SOUND_PREFIX}${s.id}`;
              const selected = value === id;
              const playing = previewing === s.id;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    selected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/60",
                  )}
                >
                  <Music className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => onChange(id as T)}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    title={s.name}
                  >
                    {s.name}
                  </button>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDuration(s.duration) || formatBytes(s.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={playing ? "Stop preview" : `Preview ${s.name}`}
                    onClick={() => void preview(s)}
                    className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {playing ? (
                      <Square className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => void remove(s)}
                    className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(error || status) && (
        <p
          className={cn(
            "text-[11px]",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error || status}
        </p>
      )}
    </div>
  );
}

/** Plays the chosen sound once through the same engine alarms use. */
export function useSoundTest(value: AlarmSound): () => void {
  return useCallback(() => {
    AudioEngine.play(value);
    setTimeout(() => AudioEngine.stop(), 5000);
  }, [value]);
}
