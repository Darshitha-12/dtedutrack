"use client";

import * as React from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./study-flow.css";
import { cn } from "@/lib/utils";
import { getSyncState, subscribeSync, runSync, isOfflineBuild, type SyncState } from "@/lib/account-sync";

type StudyData = { label: string };
type StudyNode = Node<StudyData, "study">;
type FlowData = { nodes: StudyNode[]; edges: Edge[]; viewport: Viewport };
type DayEntry = FlowData & { updatedAt: number };

const DAY_PREFIX = "biopulse.studyflow.d."; // per-day offline cache (mirrored to the account)
const SEEN_KEY = "biopulse.studyflow.seen";

const ARROW = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#c4b5fd" } as const;

function normalizeEdges(edges: Edge[]): Edge[] {
  return (edges ?? []).map((e) => ({
    ...e,
    type: "smoothstep",
    markerEnd: e.markerEnd ?? ARROW,
    style: { strokeWidth: 2, stroke: "#c4b5fd", ...(e.style ?? {}) },
  }));
}

// Deterministic vivid hue per node id so every box gets its own bright colour.
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

const SAMPLE: FlowData = {
  nodes: [
    { id: "subject", type: "study", position: { x: 300, y: 40 }, data: { label: "Biology" } },
    { id: "t1", type: "study", position: { x: 80, y: 200 }, data: { label: "Read Chapter 3" } },
    { id: "t2", type: "study", position: { x: 320, y: 200 }, data: { label: "Past paper 2019" } },
    { id: "t3", type: "study", position: { x: 560, y: 200 }, data: { label: "Revise flashcards" } },
  ],
  edges: [
    { id: "e1", source: "subject", target: "t1" },
    { id: "e2", source: "subject", target: "t2" },
    { id: "e3", source: "subject", target: "t3" },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

// ---- local calendar-day helpers (the user's "today", not UTC) ----

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDateKey(dt);
}

function dayLabel(key: string): string {
  const today = localDateKey();
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  if (key === addDays(today, 1)) return "Tomorrow";
  return key;
}

// ---- offline cache (per day) ----

function readDay(date: string): DayEntry | null {
  try {
    const raw = localStorage.getItem(DAY_PREFIX + date);
    return raw ? (JSON.parse(raw) as DayEntry) : null;
  } catch {
    return null;
  }
}

function writeDay(date: string, entry: DayEntry): void {
  try {
    localStorage.setItem(DAY_PREFIX + date, JSON.stringify(entry));
  } catch {
    /* storage unavailable */
  }
}

interface EditCtx {
  editingId: string | null;
  startEdit: (id: string) => void;
  commit: (id: string, label: string) => void;
  cancel: () => void;
}
const EditContext = React.createContext<EditCtx | null>(null);

function StudyNodeView({ id, data, selected }: NodeProps<StudyNode>) {
  const ctx = React.useContext(EditContext);
  const editing = ctx?.editingId === id;
  const [draft, setDraft] = React.useState(data.label);
  const hue = React.useMemo(() => hueFromId(id), [id]);
  const lastTap = React.useRef(0);
  const downPt = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (editing) setDraft(data.label);
  }, [editing, data.label]);

  const commit = () => ctx?.commit(id, draft);

  return (
    <div
      className={cn("study-node", selected && "selected", editing && "nodrag")}
      style={{ "--study-h": hue } as React.CSSProperties}
      onPointerDown={(e) => {
        downPt.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const d = downPt.current;
        downPt.current = null;
        if (!d) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
        const now = Date.now();
        if (now - lastTap.current < 320) ctx?.startEdit(id);
        lastTap.current = now;
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />

      {editing ? (
        <textarea
          className="study-node__input nodrag nowheel"
          value={draft}
          autoFocus
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              ctx?.cancel();
            }
          }}
        />
      ) : (
        <>
          <div className="study-node__text">{data.label}</div>
          <div className="study-node__hint">double-tap to edit</div>
        </>
      )}
    </div>
  );
}

const nodeTypes = { study: StudyNodeView };

function ToolbarButton({
  onClick,
  children,
  variant = "ghost",
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        variant === "primary"
          ? "bg-gradient-to-r from-violet-600 to-sky-500 text-white shadow hover:opacity-90"
          : "border border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function accountLabel(s: SyncState): string {
  if (s.status === "syncing") return "Syncing…";
  if (s.status === "ok") {
    return s.lastSyncedAt
      ? `Synced ${new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Synced";
  }
  if (s.status === "error") return "Offline · will sync when online";
  if (s.status === "no-account") return isOfflineBuild() ? "Not linked · sign in to sync" : "";
  return "";
}

function Flow() {
  const rf = useReactFlow();
  const [dateKey, setDateKey] = React.useState(() => localDateKey());
  const [nodes, setNodes, onNodesChange] = useNodesState<StudyNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sync, setSync] = React.useState<SyncState>(() => getSyncState());

  const hydrated = React.useRef(false);
  const dirty = React.useRef(false);
  const saveTimer = React.useRef<number | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dateRef = React.useRef(dateKey);
  dateRef.current = dateKey;

  React.useEffect(() => subscribeSync(setSync), []);

  const flash = React.useCallback((msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(""), 1800);
  }, []);

  const commit = React.useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim() || "Untitled";
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n)));
      setEditingId(null);
    },
    [setNodes],
  );

  const getFlow = React.useCallback(
    (): FlowData => ({
      nodes: rf.getNodes() as StudyNode[],
      edges: rf.getEdges(),
      viewport: rf.getViewport(),
    }),
    [rf],
  );

  const applyDay = React.useCallback(
    (entry: DayEntry | null) => {
      setNodes(entry?.nodes ?? []);
      setEdges(normalizeEdges(entry?.edges ?? []));
      if (entry?.viewport) {
        window.setTimeout(() => rf.setViewport(entry.viewport, { duration: 0 }), 0);
      }
    },
    [rf, setNodes, setEdges],
  );

  const saveLocal = React.useCallback(() => {
    const entry: DayEntry = { ...getFlow(), updatedAt: Date.now() };
    writeDay(dateRef.current, entry);
    dirty.current = false;
  }, [getFlow]);

  const markDirty = React.useCallback(() => {
    if (!hydrated.current) return;
    dirty.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      saveLocal();
      void runSync();
    }, 700);
  }, [saveLocal]);

  // Load the selected day from the offline cache; cloud sync runs in the background.
  React.useEffect(() => {
    hydrated.current = false;
    setEditingId(null);
    const local = readDay(dateKey);
    if (local) {
      applyDay(local);
    } else {
      setNodes([]);
      setEdges([]);
      if (dateKey === localDateKey()) {
        let seen = false;
        try {
          seen = localStorage.getItem(SEEN_KEY) === "1";
        } catch {
          /* ignore */
        }
        if (!seen) {
          setNodes(SAMPLE.nodes);
          setEdges(normalizeEdges(SAMPLE.edges));
        }
      }
    }
    hydrated.current = true;
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  // When the account sync writes a newer version of the visible day, refresh it.
  React.useEffect(() => {
    const onKvSynced = (e: Event) => {
      const detail = (e as CustomEvent<{ keys?: string[] }>).detail;
      if (!detail?.keys?.includes(DAY_PREFIX + dateRef.current)) return;
      if (dirty.current) return;
      const entry = readDay(dateRef.current);
      if (entry) applyDay(entry);
    };
    window.addEventListener("biopulse:kvsynced", onKvSynced);
    return () => window.removeEventListener("biopulse:kvsynced", onKvSynced);
  }, [applyDay]);

  const goToDay = React.useCallback(
    (next: string) => {
      if (next === dateKey) return;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (dirty.current) {
        saveLocal();
        void runSync();
      }
      setDateKey(next);
    },
    [dateKey, saveLocal],
  );

  const onConnect = React.useCallback(
    (c: Connection) => {
      setEdges((eds) =>
        addEdge(
          { ...c, type: "smoothstep", markerEnd: ARROW, style: { strokeWidth: 2, stroke: "#c4b5fd" } },
          eds,
        ),
      );
      markDirty();
    },
    [setEdges, markDirty],
  );

  const addNode = React.useCallback(() => {
    const pos = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = `n_${Date.now().toString(36)}`;
    setNodes((nds) => nds.concat({ id, type: "study", position: pos, data: { label: "New task" } }));
    setEditingId(id);
    markDirty();
    flash("Node added");
  }, [rf, setNodes, markDirty, flash]);

  const exportFile = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(getFlow(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-flow-${dateKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported");
  }, [getFlow, flash, dateKey]);

  const importFile = React.useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result)) as FlowData;
          if (!Array.isArray(data.nodes)) throw new Error("bad file");
          setNodes(data.nodes);
          setEdges(normalizeEdges(data.edges ?? []));
          window.setTimeout(
            () => rf.setViewport(data.viewport ?? { x: 0, y: 0, zoom: 1 }, { duration: 200 }),
            0,
          );
          markDirty();
          flash("Imported");
        } catch {
          flash("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    },
    [rf, setNodes, setEdges, markDirty, flash],
  );

  const copyJson = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getFlow()));
      flash("JSON copied");
    } catch {
      flash("Copy failed");
    }
  }, [getFlow, flash]);

  const clearAll = React.useCallback(() => {
    setNodes([]);
    setEdges([]);
    setEditingId(null);
    markDirty();
    flash("Cleared");
  }, [setNodes, setEdges, markDirty, flash]);

  const deleteSelected = React.useCallback(() => {
    const selN = rf.getNodes().filter((n) => n.selected).map((n) => ({ id: n.id }));
    const selE = rf.getEdges().filter((e) => e.selected).map((e) => ({ id: e.id }));
    if (!selN.length && !selE.length) return flash("Select a node/arrow first");
    rf.deleteElements({ nodes: selN, edges: selE });
    markDirty();
  }, [rf, markDirty, flash]);

  const manualSync = React.useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveLocal();
    void runSync().then(() => flash("Saved"));
  }, [saveLocal, flash]);

  const today = localDateKey();
  const tabs = [
    { key: addDays(today, -1), label: "Yesterday" },
    { key: today, label: "Today" },
    { key: addDays(today, 1), label: "Tomorrow" },
  ];
  const syncText = accountLabel(sync);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goToDay(addDays(dateKey, -1))}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold hover:bg-muted"
          aria-label="Previous day"
        >
          ‹
        </button>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goToDay(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              t.key === dateKey
                ? "bg-gradient-to-r from-violet-600 to-sky-500 text-white shadow"
                : "border border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => goToDay(addDays(dateKey, 1))}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold hover:bg-muted"
          aria-label="Next day"
        >
          ›
        </button>
        <input
          type="date"
          value={dateKey}
          onChange={(e) => e.target.value && goToDay(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
        />
        <span className="text-xs font-medium text-muted-foreground">{dayLabel(dateKey)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cloud sync:</span>
        <ToolbarButton onClick={manualSync}>Sync now</ToolbarButton>
        {syncText && <span className="text-xs font-medium text-muted-foreground">{syncText}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={addNode} variant="primary">
          + Add Node
        </ToolbarButton>
        <ToolbarButton onClick={manualSync}>Save</ToolbarButton>
        <ToolbarButton onClick={exportFile}>Export</ToolbarButton>
        <ToolbarButton onClick={() => fileRef.current?.click()}>Import</ToolbarButton>
        <ToolbarButton onClick={copyJson}>Copy JSON</ToolbarButton>
        <ToolbarButton onClick={() => rf.fitView({ padding: 0.25, duration: 300 })}>Fit</ToolbarButton>
        <ToolbarButton onClick={deleteSelected}>Delete</ToolbarButton>
        <ToolbarButton onClick={clearAll}>Clear</ToolbarButton>
        {status && <span className="ml-1 text-xs font-medium text-muted-foreground">{status}</span>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to move · drag a dot on a box edge onto another box to connect · double-tap a box to edit
        (Enter = save, Esc = cancel) · pinch to zoom, drag the canvas to pan. Each day is saved on this
        device and synced to every device signed into your account.
      </p>

      <div className="study-flow-wrap">
        <EditContext.Provider
          value={{ editingId, startEdit: setEditingId, commit, cancel: () => setEditingId(null) }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              if (changes.some((c) => c.type === "position" || c.type === "remove" || c.type === "add")) {
                markDirty();
              }
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              if (changes.some((c) => c.type === "remove" || c.type === "add")) markDirty();
            }}
            onConnect={onConnect}
            onNodeDragStop={() => markDirty()}
            onMoveEnd={() => markDirty()}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: ARROW, style: { strokeWidth: 2, stroke: "#c4b5fd" } }}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.2}
            maxZoom={2.5}
            panOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            onNodeDoubleClick={(_, n) => setEditingId(n.id)}
            onPaneClick={() => setEditingId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(139 92 246 / 0.28)" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => `hsl(${hueFromId(n.id)} 90% 62%)`}
              maskColor="rgb(20 12 45 / 0.45)"
            />
          </ReactFlow>
        </EditContext.Provider>
      </div>
    </div>
  );
}

export default function StudyFlowChart() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
