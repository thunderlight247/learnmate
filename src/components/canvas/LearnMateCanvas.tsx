'use client';

// Phase 6 Step 5: the main LearnMate canvas wrapper.
//
// Owns the interactive xyflow state (useNodesState/useEdgesState), runs the
// dagre auto-layout on mount (and whenever the blueprint changes or the
// user clicks "Auto-layout"), and renders the ReactFlow surface with
// Background, Controls, and MiniMap. ProjectCanvas composes this with the
// bill-of-materials panel.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Sparkles, LayoutTemplate, Check, Loader2, AlertCircle, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import HardwareNode from './HardwareNode';
import { computeFlowLayout } from '@/lib/canvas/layout';
import {
  toFlowEdge,
  toFlowNode,
  type BlueprintEdge,
  type HardwareNode as HardwareNodeType,
  type ProjectGenerationResponse,
} from '@/types/canvas';

const nodeTypes: NodeTypes = { hardware: HardwareNode };

type Project = ProjectGenerationResponse['project'];

interface LearnMateCanvasProps {
  project: Project;
  selectedNodeId?: string | null;
  onSelectNode?: (node: HardwareNodeType | null) => void;
}

export default function LearnMateCanvas({
  project,
  selectedNodeId,
  onSelectNode,
}: LearnMateCanvasProps) {
  // Initial nodes use the AI's persisted grid positions...
  const initialNodes = useMemo<HardwareNodeType[]>(
    () => project.nodes.map(toFlowNode),
    [project.nodes],
  );
  const initialEdges = useMemo<BlueprintEdge[]>(
    () => project.edges.map(toFlowEdge),
    [project.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const rfInstanceRef = useRef<ReactFlowInstance<HardwareNodeType, BlueprintEdge> | null>(null);
  const lastCenteredIdRef = useRef<string | null>(null);
  const nodesRef = useRef<HardwareNodeType[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Sync selected state into nodes when selectedNodeId changes (loop-free)
  useEffect(() => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((n) => {
        const isSelected = n.id === selectedNodeId;
        if (n.selected !== isSelected) {
          changed = true;
          return { ...n, selected: isSelected };
        }
        return n;
      });
      return changed ? next : current;
    });

    if (selectedNodeId && selectedNodeId !== lastCenteredIdRef.current && rfInstanceRef.current) {
      lastCenteredIdRef.current = selectedNodeId;
      const target = nodesRef.current.find((n) => n.id === selectedNodeId);
      if (target) {
        rfInstanceRef.current.setCenter(
          target.position.x + 135,
          target.position.y + 85,
          { zoom: 1.2, duration: 400 },
        );
      }
    } else if (!selectedNodeId) {
      lastCenteredIdRef.current = null;
    }
  }, [selectedNodeId, setNodes]);

  // Re-seed xyflow state whenever the underlying blueprint changes
  // (new generation, layout toggle, or manual re-layout).
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<HardwareNodeType>[]) => onNodesChange(changes),
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<BlueprintEdge>[]) => onEdgesChange(changes),
    [onEdgesChange],
  );

  // Persists current coordinates to the database so dragged positions stick
  const persistCoordinates = useCallback(async (nodesToPersist: HardwareNodeType[]) => {
    try {
      setSaveStatus('saving');
      const response = await fetch('/api/projects/nodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: nodesToPersist.map((n) => ({
            id: n.id,
            positionX: Math.round(n.position.x),
            positionY: Math.round(n.position.y),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to persist node coordinates');
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Error saving node coordinates:', err);
      setSaveStatus('error');
    }
  }, []);

  const handleNodeDragStop: OnNodeDrag<HardwareNodeType> = useCallback(
    () => {
      // Persist all current node coordinates on drag release
      persistCoordinates(nodes);
    },
    [nodes, persistCoordinates],
  );

  const handleAutoLayout = useCallback(() => {
    const positions = computeFlowLayout(nodes, edges);
    const updated = nodes.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    });
    setNodes(updated);
    persistCoordinates(updated);
  }, [nodes, edges, setNodes, persistCoordinates]);

  const [showLayouted, setShowLayouted] = useState(false);

  const toggleLayout = useCallback(() => {
    setShowLayouted((value) => {
      const next = !value;
      if (next) {
        // Returning to the auto-layout view: re-run dagre over the
        // blueprint records rather than restoring stale positions.
        const positions = computeFlowLayout(initialNodes, initialEdges);
        const updated = initialNodes.map((node) => {
          const position = positions.get(node.id);
          return position ? { ...node, position } : node;
        });
        setNodes(updated);
        persistCoordinates(updated);
      } else {
        setNodes(initialNodes);
        persistCoordinates(initialNodes);
      }
      return next;
    });
  }, [initialNodes, initialEdges, setNodes, persistCoordinates]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_event, node) => onSelectNode?.(node as HardwareNodeType)}
        onPaneClick={() => onSelectNode?.(null)}
        onInit={(instance) => {
          rfInstanceRef.current = instance;
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.15 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {/* Coordinate Save Status Indicator */}
      {saveStatus !== 'idle' && (
        <div className="absolute left-3 top-3 z-10">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-blue-600 shadow-sm backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving layout...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-green-700 shadow-sm backdrop-blur-sm">
              <Check className="h-3 w-3 text-green-600" />
              Layout saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-red-600 shadow-sm backdrop-blur-sm">
              <AlertCircle className="h-3 w-3 text-red-500" />
              Save failed
            </span>
          )}
        </div>
      )}

      {/* Layout & Zoom Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-gray-200/90 bg-white/95 p-1 shadow-md backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1 px-1">
          <button
            type="button"
            title="Zoom In"
            onClick={() => rfInstanceRef.current?.zoomIn({ duration: 300 })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 hover:text-blue-600"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Zoom Out"
            onClick={() => rfInstanceRef.current?.zoomOut({ duration: 300 })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 hover:text-blue-600"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Fit view"
            onClick={() => rfInstanceRef.current?.fitView({ padding: 0.12, duration: 400 })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 hover:text-blue-600"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleAutoLayout}
          className="flex items-center rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
        >
          <LayoutTemplate className="mr-1.5 h-3.5 w-3.5 text-gray-500" />
          Auto-layout
        </button>
        <button
          type="button"
          onClick={toggleLayout}
          className="flex items-center rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
          {showLayouted ? 'AI layout' : 'Flow layout'}
        </button>
      </div>
    </div>
  );
}
