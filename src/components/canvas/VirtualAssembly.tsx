'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { ProjectGenerationResponse } from '@/types/canvas';
import Assembly3D from './Assembly3D';

type Project = ProjectGenerationResponse['project'];

const ASSEMBLY_STORAGE_PREFIX = 'learnmate_virtual_assembly:';

export function restoreAssembly(raw: string | null, project: Project): { nodes: Node[]; edges: Edge[] } {
  if (!raw) return { nodes: [], edges: [] };
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { nodes: [], edges: [] };
    const data = saved as { nodes?: unknown; edges?: unknown; version?: unknown };
    if (data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return { nodes: [], edges: [] };
    const parts = new Map(project.nodes.map((part) => [part.id, part]));
    const ids = new Set<string>();
    const nodes: Node[] = [];
    for (const value of data.nodes) {
      if (!value || typeof value !== 'object') continue;
      const node = value as { id?: unknown; x?: unknown; y?: unknown };
      const part = typeof node.id === 'string' ? parts.get(node.id) : undefined;
      if (!part || ids.has(part.id) || typeof node.x !== 'number' || !Number.isFinite(node.x) || typeof node.y !== 'number' || !Number.isFinite(node.y)) continue;
      ids.add(part.id);
      nodes.push(makeAssemblyNode(part, { x: node.x, y: node.y }));
    }
    const pairs = new Set<string>();
    const edges: Edge[] = [];
    for (const value of data.edges) {
      if (!value || typeof value !== 'object') continue;
      const edge = value as { source?: unknown; target?: unknown };
      if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
      const pair = JSON.stringify([edge.source, edge.target]);
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      const match = project.edges.find((item) => item.sourceNodeId === edge.source && item.targetNodeId === edge.target);
      edges.push({ id: `saved-${edges.length}`, source: edge.source, target: edge.target, label: match?.label || undefined, animated: true, style: { stroke: match ? '#4f46e5' : '#ef4444' } });
    }
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function serializeAssembly(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({ version: 1, nodes: nodes.map(({ id, position }) => ({ id, x: position.x, y: position.y })), edges: edges.map(({ source, target }) => ({ source, target })) });
}

function makeAssemblyNode(part: Project['nodes'][number], position: { x: number; y: number }): Node {
  return {
    id: part.id, position, data: { label: componentLabel(part) },
    style: { border: '1px solid #818cf8', borderRadius: 12, background: '#eef2ff', padding: 12, width: 150, color: '#1e1b4b', fontWeight: 600 },
  };
}

function componentLabel(node: Project['nodes'][number]): string {
  return typeof node.properties?.label === 'string' && node.properties.label.trim()
    ? node.properties.label
    : node.type;
}

export function checkAssembly(project: Project, nodeIds: string[], connections: Array<{ source: string; target: string }>) {
  const placed = new Set(nodeIds);
  const expected = new Set(project.edges.map((edge) => `${edge.sourceNodeId}:${edge.targetNodeId}`));
  const connected = new Set(connections.map((edge) => `${edge.source}:${edge.target}`));
  const missingParts = project.nodes.filter((node) => !placed.has(node.id));
  const missingConnections = project.edges.filter((edge) => !connected.has(`${edge.sourceNodeId}:${edge.targetNodeId}`));
  const unexpectedConnections = connections.filter((edge) => !expected.has(`${edge.source}:${edge.target}`));
  return { missingParts, missingConnections, unexpectedConnections, ready: project.nodes.length > 0 && missingParts.length === 0 && missingConnections.length === 0 && unexpectedConnections.length === 0 };
}

type AssemblyStep =
  | { kind: 'place'; id: string; title: string; detail: string | null; complete: boolean }
  | { kind: 'connect'; id: string; source: string; target: string; title: string; detail: string | null; complete: boolean };

/** A schematic checklist, not physical assembly or wiring instructions. */
export function getAssemblyGuide(project: Project, nodeIds: string[], connections: Array<{ source: string; target: string }>): { steps: AssemblyStep[]; skippedEdges: number } {
  const placed = new Set(nodeIds);
  const connected = new Set(connections.map(({ source, target }) => JSON.stringify([source, target])));
  const parts = new Map(project.nodes.map((node) => [node.id, node]));
  const steps: AssemblyStep[] = project.nodes.map((part) => ({
    kind: 'place', id: `place:${part.id}`, title: `Place ${componentLabel(part)}`,
    detail: typeof part.properties?.role === 'string' && part.properties.role.trim() ? part.properties.role : null,
    complete: placed.has(part.id),
  }));
  let skippedEdges = 0;
  for (const edge of project.edges) {
    const source = parts.get(edge.sourceNodeId);
    const target = parts.get(edge.targetNodeId);
    if (!source || !target || source.id === target.id) { skippedEdges++; continue; }
    steps.push({
      kind: 'connect', id: `connect:${edge.id}`, source: source.id, target: target.id,
      title: `Connect ${componentLabel(source)} → ${componentLabel(target)}`,
      detail: edge.label?.trim() || null,
      complete: placed.has(source.id) && placed.has(target.id) && connected.has(JSON.stringify([source.id, target.id])),
    });
  }
  return { steps, skippedEdges };
}

function AssemblyBench({ project }: { project: Project }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [guideStepId, setGuideStepId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'loading' | 'saved' | 'saving' | 'offline' | 'conflict'>('loading');
  const [storageError, setStorageError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const revision = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const lastSynced = useRef<string | null>(null);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const mounted = useRef(false);
  const storageKey = `${ASSEMBLY_STORAGE_PREFIX}${project.id}`;
  const { screenToFlowPosition } = useReactFlow();

  const saveLocal = useCallback((raw: string, dirty: boolean, baseRevision: number | null) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 2, progress: JSON.parse(raw), dirty, baseRevision }));
      if (mounted.current) setStorageError(false);
    } catch {
      if (mounted.current) setStorageError(true);
    }
  }, [storageKey]);

  const flush = useCallback(async () => {
    if (inFlight.current || blocked.current || revision.current === null || !pending.current) return;
    inFlight.current = true;
    try {
      while (pending.current && !blocked.current && revision.current !== null) {
        const snapshot: string = pending.current;
        const base: number = revision.current;
        if (mounted.current) setSyncStatus('saving');
        const response = await fetch('/api/projects/assembly', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, revision: base, progress: JSON.parse(snapshot) }),
        });
        if (response.status === 409) {
          blocked.current = true;
          if (mounted.current) setSyncStatus('conflict');
          return;
        }
        if (!response.ok) throw new Error('Assembly save failed');
        const data = await response.json() as { revision: number };
        revision.current = data.revision;
        lastSynced.current = snapshot;
        if (pending.current === snapshot) pending.current = null;
        saveLocal(pending.current ?? snapshot, pending.current !== null, data.revision);
        if (mounted.current) setSyncStatus(pending.current ? 'saving' : 'saved');
      }
    } catch {
      blocked.current = true;
      if (mounted.current) setSyncStatus('offline');
    } finally {
      inFlight.current = false;
    }
  }, [project.id, saveLocal]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const load = async () => {
      let localRaw: string | null = null;
      let localDirty = false;
      let localBase: number | null = null;
      try {
        const value = window.localStorage.getItem(storageKey);
        if (value) {
          const parsed = JSON.parse(value) as { version?: number; progress?: unknown; dirty?: boolean; baseRevision?: number | null };
          if (parsed.version === 2) {
            localRaw = JSON.stringify(parsed.progress);
            localDirty = parsed.dirty === true;
            localBase = typeof parsed.baseRevision === 'number' ? parsed.baseRevision : null;
          } else {
            localRaw = value;
            localDirty = true;
          }
        }
      } catch {
        if (!cancelled) setStorageError(true);
      }
      try {
        const response = await fetch(`/api/projects/assembly?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Assembly load failed');
        const data = await response.json() as { progress: unknown; revision: number };
        if (cancelled) return;
        revision.current = data.revision;
        const canUseLocal = localDirty && (localBase === data.revision || (localBase === null && data.progress === null));
        const conflicted = localDirty && !canUseLocal;
        const raw = canUseLocal || conflicted ? localRaw : data.progress === null ? null : JSON.stringify(data.progress);
        const restored = restoreAssembly(raw, project);
        setNodes(restored.nodes);
        setEdges(restored.edges);
        const restoredRaw = serializeAssembly(restored.nodes, restored.edges);
        lastSynced.current = canUseLocal || conflicted ? null : restoredRaw;
        pending.current = canUseLocal || conflicted ? restoredRaw : null;
        blocked.current = conflicted;
        setSyncStatus(conflicted ? 'conflict' : canUseLocal ? 'saving' : 'saved');
        if (!conflicted && !canUseLocal) saveLocal(restoredRaw, false, data.revision);
        setLoaded(true);
      } catch {
        if (cancelled) return;
        const restored = restoreAssembly(localRaw, project);
        setNodes(restored.nodes);
        setEdges(restored.edges);
        revision.current = localBase;
        const restoredRaw = serializeAssembly(restored.nodes, restored.edges);
        lastSynced.current = localDirty ? null : restoredRaw;
        pending.current = localDirty ? restoredRaw : null;
        blocked.current = true;
        setSyncStatus('offline');
        setLoaded(true);
      }
    };
    void load();
    return () => { cancelled = true; mounted.current = false; };
  }, [project, reloadVersion, saveLocal, setEdges, setNodes, storageKey]);

  useEffect(() => {
    if (!loaded) return;
    const raw = serializeAssembly(nodes, edges);
    if (pending.current === null && raw === lastSynced.current) return;
    pending.current = raw;
    saveLocal(raw, true, revision.current);
    if (blocked.current || revision.current === null) return;
    const timer = window.setTimeout(() => { void flush(); }, 500);
    return () => window.clearTimeout(timer);
  }, [loaded, nodes, edges, flush, saveLocal]);

  useEffect(() => () => { void flush(); }, [flush]);

  const placedIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const expected = useMemo(() => new Set(project.edges.map((edge) => `${edge.sourceNodeId}:${edge.targetNodeId}`)), [project.edges]);
  const connected = useMemo(() => new Set(edges.map((edge) => `${edge.source}:${edge.target}`)), [edges]);
  const { missingParts, missingConnections, unexpectedConnections, ready } = checkAssembly(project, nodes.map((node) => node.id), edges);
  const selected = project.nodes.find((node) => node.id === selectedId);
  const guide = getAssemblyGuide(project, nodes.map((node) => node.id), edges);
  const completedSteps = guide.steps.filter((step) => step.complete).length;
  const activeStep = guide.steps.find((step) => step.id === guideStepId) ?? guide.steps.find((step) => !step.complete) ?? guide.steps[guide.steps.length - 1];
  const activeStepIndex = activeStep ? guide.steps.indexOf(activeStep) : -1;

  const addComponent = useCallback((id: string, position?: { x: number; y: number }) => {
    const part = project.nodes.find((node) => node.id === id);
    if (!part || placedIds.has(id)) return;
    const index = nodes.length;
    setNodes((current) => [...current, makeAssemblyNode(part, position ?? { x: 60 + (index % 3) * 190, y: 60 + Math.floor(index / 3) * 110 })]);
    setChecked(false);
  }, [nodes.length, placedIds, project.nodes, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => {
      if (current.some((edge) => edge.source === connection.source && edge.target === connection.target)) return current;
      const match = project.edges.find((edge) => edge.sourceNodeId === connection.source && edge.targetNodeId === connection.target);
      return addEdge({ ...connection, label: match?.label || undefined, animated: true, style: { stroke: match ? '#4f46e5' : '#ef4444' } }, current);
    });
    setChecked(false);
  }, [project.edges, setEdges]);

  const removeSelected = () => {
    if (!selectedId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId));
    setSelectedId(null);
    setChecked(false);
  };

  if (!loaded) return <p className="p-4 text-sm text-slate-500">Restoring your assembly…</p>;

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Practice workspace</p>
          <h4 className="mt-1 text-lg font-bold text-slate-900">Build {project.title}</h4>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Place the blueprint components on the bench, then connect their handles. Use Check assembly to compare your work with the generated blueprint.</p>
        </div>
        <button type="button" onClick={() => { setNodes([]); setEdges([]); setSelectedId(null); setSelectedEdgeId(null); setChecked(false); setGuideStepId(null); }} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><RotateCcw className="h-4 w-4" /> Reset bench</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <p role="status" className={storageError || syncStatus === 'conflict' || syncStatus === 'offline' ? 'text-red-700' : 'text-slate-500'}>
          {syncStatus === 'conflict' ? 'Assembly changed on another device. Your local edits have not been synced.' : syncStatus === 'offline' ? 'Server unavailable. Progress has not synced.' : syncStatus === 'saving' ? 'Saving assembly…' : 'Assembly saved to server.'}
          {storageError && ' Browser backup unavailable; unsynced changes may be lost.'}
        </p>
        {syncStatus === 'offline' && <button type="button" className="font-semibold text-indigo-700 underline" onClick={() => { setLoaded(false); setReloadVersion((n) => n + 1); }}>Retry sync</button>}
        {syncStatus === 'conflict' && <button type="button" className="font-semibold text-indigo-700 underline" onClick={() => { if (!window.confirm('Discard your unsynced local changes and load the server version?')) return; try { window.localStorage.removeItem(storageKey); } catch { setStorageError(true); } setLoaded(false); setReloadVersion((n) => n + 1); }}>Discard local changes and reload</button>}
        <button type="button" className="font-semibold text-indigo-700 underline" onClick={async () => { const url = new URL(window.location.href); url.searchParams.set('project', project.id); try { await navigator.clipboard.writeText(url.toString()); window.alert('Project link copied. Open it on your other device.'); } catch { window.prompt('Copy this project link:', url.toString()); } }}>Copy project link</button>
      </div>
      <p className="text-xs text-slate-500">Anyone with the project link can access this project; this personal-use app has no sign-in.</p>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">This is a schematic assembly exercise using AI-generated blueprint parts and connections. It is not a physical 3D CAD model, wiring validation, or a physics simulator. Review the blueprint before relying on it.</p>
      {guide.steps.length > 0 && (
        <section aria-label="Guided assembly" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h5 className="font-semibold text-indigo-950">Guided assembly</h5><p className="text-xs text-indigo-800">{completedSteps} of {guide.steps.length} steps complete · follows the blueprint, not a verified physical build order</p></div>
            <button type="button" onClick={() => setGuideStepId(null)} className="text-xs font-semibold text-indigo-700 underline">Go to next incomplete</button>
          </div>
          {activeStep && <div className="space-y-2 rounded-lg bg-white p-3">
            <p className="text-xs font-semibold text-slate-500">Step {activeStepIndex + 1} of {guide.steps.length} · {activeStep.complete ? 'Complete' : 'Not complete'}</p>
            <p className="text-sm font-semibold text-slate-900">{activeStep.title}</p>
            <p className="text-xs text-slate-600">{activeStep.kind === 'place' ? 'Drag this part from the component list or use the button below.' : 'Place both parts first, then drag from the source handle to the target handle on the bench.'}</p>
            {activeStep.detail && <p className="text-xs text-slate-600">{activeStep.kind === 'place' ? 'Blueprint role' : 'Blueprint connection'}: {activeStep.detail}</p>}
            {activeStep.kind === 'place' && !activeStep.complete && <button type="button" onClick={() => addComponent(activeStep.id.slice('place:'.length))} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Add this part</button>}
            <div className="flex gap-3 pt-1 text-xs font-semibold text-indigo-700">
              <button type="button" disabled={activeStepIndex <= 0} onClick={() => setGuideStepId(guide.steps[activeStepIndex - 1].id)} className="disabled:text-slate-400">Previous</button>
              <button type="button" disabled={activeStepIndex >= guide.steps.length - 1} onClick={() => setGuideStepId(guide.steps[activeStepIndex + 1].id)} className="disabled:text-slate-400">Next</button>
            </div>
          </div>}
          {guide.skippedEdges > 0 && <p className="text-xs text-amber-800">{guide.skippedEdges} blueprint connection(s) could not be guided because their endpoints are missing or invalid.</p>}
          {completedSteps === guide.steps.length && <p role="status" className="text-xs font-semibold text-emerald-700">All guided steps are complete. Use Check assembly to review the full graph.</p>}
        </section>
      )}
      {project.nodes.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">This blueprint has no components to assemble. Generate a new blueprint to begin.</p> : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-slate-900">1. Components <span className="font-normal text-slate-500">({nodes.length}/{project.nodes.length})</span></h5>
            <p className="text-xs text-slate-500">Drag a part onto the bench or click Add.</p>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {project.nodes.map((part) => (
                <div key={part.id} draggable={!placedIds.has(part.id)} onDragStart={(event) => { event.dataTransfer.setData('application/learnmate-component', part.id); event.dataTransfer.effectAllowed = 'copy'; }} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="break-words text-sm font-medium text-slate-800">{componentLabel(part)}</p>
                  <div className="mt-1 flex items-center justify-between gap-1"><span className="text-xs capitalize text-slate-500">{part.type}</span><button type="button" disabled={placedIds.has(part.id)} onClick={() => addComponent(part.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:text-slate-400">{placedIds.has(part.id) ? 'Placed' : 'Add +'}</button></div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-semibold text-slate-900">2. Assemble and connect</h5><span className="text-xs text-slate-500">Drag parts to rearrange · connect handles · select a connection to remove it</span></div>
            <div className="h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('application/learnmate-component'); if (id) addComponent(id, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); }} onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); }} deleteKeyCode={null} fitView>
                <Background /><Controls showInteractive={false} />
              </ReactFlow>
            </div>
            {selectedEdgeId && <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-950"><span>Connection selected</span><button type="button" onClick={() => { setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId)); setSelectedEdgeId(null); setChecked(false); }} className="font-semibold text-red-700 hover:underline">Remove connection</button></div>}
            {selected && <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div><p className="text-sm font-semibold text-indigo-950">{componentLabel(selected)}</p><p className="mt-1 text-xs text-indigo-800">{typeof selected.properties?.role === 'string' && selected.properties.role ? selected.properties.role : `Blueprint component: ${selected.type}`}</p></div><button type="button" onClick={removeSelected} className="text-xs font-semibold text-red-700 hover:underline">Remove part</button></div>}
            <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setChecked(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">3. Check assembly</button><span className="text-xs text-slate-500">{connected.size} connection{connected.size === 1 ? '' : 's'} made · {expected.size} in blueprint</span></div>
            {checked && <div role="status" className={`rounded-lg border p-3 text-sm ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {ready ? <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Assembly matches the blueprint graph.</p> : <div className="space-y-1"><p className="font-semibold">Keep building</p><p>{missingParts.length} component(s) still to place · {missingConnections.length} blueprint connection(s) missing · {unexpectedConnections.length} connection(s) not in the blueprint.</p></div>}
              {project.edges.length === 0 && <p className="mt-1 text-xs">This blueprint has no connections, so wiring cannot be checked.</p>}
            </div>}
          </div>
        </div>
      )}
      <Assembly3D project={project} nodes={nodes} edges={edges} />
    </section>
  );
}

export default function VirtualAssembly({ project }: { project: Project }) {
  return <ReactFlowProvider><AssemblyBench key={project.id} project={project} /></ReactFlowProvider>;
}
