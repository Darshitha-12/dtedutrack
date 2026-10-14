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

type StudyData = { label: string };
type StudyNode = Node<StudyData, "study">;

type FlowData = { nodes: StudyNode[]; edges: Edge[]; viewport: Viewport };

const STORAGE_KEY = "biopulse.studyflow.v1";

const ARROW = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#8b5cf6" } as const;

function normalizeEdges(edges: Edge[]): Edge[] {
  return (edges ?? []).map((e) => ({
    ...e,
    type: "smoothstep",
    markerEnd: e.markerEnd ?? ARROW,
    style: { strokeWidth: 2, stroke: "#8b5cf6", ...(e.style ?? {}) },
  }));
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
  ].map((e) => ({ ...e, sourceHandle: undefined, targetHandle: undefined })),
  viewport: { x: 0, y: 0, zoom: 1 },
};

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
  const lastTap = React.useRef(0);
  const downPt = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (editing) setDraft(data.label);
  }, [editing, data.label]);

  const commit = () => ctx?.commit(id, draft);

  return (
    <div
      className={cn("study-node", selected && "selected", editing && "nodrag")}
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

function readSaved(): FlowData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FlowData) : null;
  } catch {
    return null;
  }
}

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

function Flow() {
  const rf = useReactFlow();
  const saved = React.useRef<FlowData | null>(readSaved()).current;

  const [nodes, setNodes, onNodesChange] = useNodesState<StudyNode>(saved?.nodes ?? SAMPLE.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    normalizeEdges(saved?.edges ?? SAMPLE.edges),
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

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

  const onConnect = React.useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...c, type: "smoothstep", markerEnd: ARROW, style: { strokeWidth: 2, stroke: "#8b5cf6" } },
          eds,
        ),
      ),
    [setEdges],
  );

  const addNode = React.useCallback(() => {
    const pos = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const id = `n_${Date.now().toString(36)}`;
    setNodes((nds) => nds.concat({ id, type: "study", position: pos, data: { label: "New task" } }));
    setEditingId(id);
    flash("Node added");
  }, [rf, setNodes, flash]);

  const saveLocal = React.useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getFlow()));
      flash("Saved on this device");
    } catch {
      flash("Save failed");
    }
  }, [getFlow, flash]);

  const loadLocal = React.useCallback(() => {
    const data = readSaved();
    if (!data) return flash("Nothing saved yet");
    setNodes(data.nodes);
    setEdges(normalizeEdges(data.edges));
    window.setTimeout(() => rf.setViewport(data.viewport ?? { x: 0, y: 0, zoom: 1 }, { duration: 200 }), 0);
    flash("Loaded");
  }, [rf, setNodes, setEdges, flash]);

  const exportFile = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(getFlow(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-flow.json";
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported study-flow.json");
  }, [getFlow, flash]);

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
          flash("Imported");
        } catch {
          flash("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    },
    [rf, setNodes, setEdges, flash],
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
    flash("Cleared");
  }, [setNodes, setEdges, flash]);

  const deleteSelected = React.useCallback(() => {
    const selN = rf.getNodes().filter((n) => n.selected).map((n) => ({ id: n.id }));
    const selE = rf.getEdges().filter((e) => e.selected).map((e) => ({ id: e.id }));
    if (!selN.length && !selE.length) return flash("Select a node/arrow first");
    rf.deleteElements({ nodes: selN, edges: selE });
  }, [rf, flash]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton onClick={addNode} variant="primary">
          + Add Node
        </ToolbarButton>
        <ToolbarButton onClick={saveLocal}>Save</ToolbarButton>
        <ToolbarButton onClick={loadLocal}>Load</ToolbarButton>
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
        (Enter = save, Esc = cancel) · pinch to zoom, drag the canvas to pan.
      </p>

      <div className="study-flow-wrap">
        <EditContext.Provider
          value={{ editingId, startEdit: setEditingId, commit, cancel: () => setEditingId(null) }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: ARROW, style: { strokeWidth: 2, stroke: "#8b5cf6" } }}
            defaultViewport={saved?.viewport ?? { x: 0, y: 0, zoom: 1 }}
            fitView={!saved}
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
              nodeColor={() => "rgb(139 92 246 / 0.6)"}
              maskColor="rgb(0 0 0 / 0.55)"
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
