// Phase 6: auto-layout engine.
//
// Runs dagre over the blueprint graph so the AI's rough grid positions
// (blueprint prompt rule 7) are replaced with a clean left-to-right layout
// on first render — signals flow source → target into each node's
// right-hand Handle, matching HardwareNode's left/right connection points.
// Accepts the CanvasNodeRecord/CanvasEdgeRecord shapes from
// /api/projects/generate; see computeFlowLayout for the xyflow-node variant.

import dagre from '@dagrejs/dagre';
import type {
  BlueprintEdge,
  CanvasEdgeRecord,
  CanvasNodeRecord,
  HardwareNode,
} from '@/types/canvas';

/** Rendered node size — keep in sync with HardwareNode's CSS. */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;

const RANK_DIRECTION = 'LR'; // left-to-right: sources feed rightward into targets
const NODE_SEPARATION = 60;
const RANK_SEPARATION = 90;

function runDagre(
  graphNodes: { id: string }[],
  graphEdges: { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (graphNodes.length === 0) return positions;

  // Dagre mutates the graph object it builds; construct it per call.
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: RANK_DIRECTION,
    nodesep: NODE_SEPARATION,
    ranksep: RANK_SEPARATION,
    marginx: 0,
    marginy: 0,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of graphNodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graphEdges) {
    // Only wire edges whose endpoints are known; the API guarantees this
    // (edges reference existing nodes) but stay defensive for live data.
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  for (const node of graphNodes) {
    const laid = graph.node(node.id);
    if (laid) {
      // dagre centers coordinates; shift back to top-left origin.
      positions.set(node.id, {
        x: laid.x - NODE_WIDTH / 2,
        y: laid.y - NODE_HEIGHT / 2,
      });
    }
  }

  return positions;
}

/**
 * Computes dagre-ordered positions for the persisted graph records.
 * Nodes without edges (isolated blocks) are arranged in an extra row at
 * the bottom so they don't stack on top of each other.
 *
 * @returns A map of nodeId → { x, y }, ready to override each node's
 * persisted positionX/positionY.
 */
export function computeAutoLayout(
  nodes: CanvasNodeRecord[],
  edges: CanvasEdgeRecord[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) return positions;

  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.sourceNodeId);
    connectedIds.add(edge.targetNodeId);
  }
  const connected = nodes.filter((node) => connectedIds.has(node.id));
  const isolated = nodes.filter((node) => !connectedIds.has(node.id));

  for (const [id, position] of runDagre(
    connected.map((node) => ({ id: node.id })),
    edges.map((edge) => ({
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
    })),
  )) {
    positions.set(id, position);
  }

  // Isolated nodes flow in a single row beneath the graph.
  const maxY = Math.max(
    0,
    ...Array.from(positions.values()).map((p) => p.y),
  );
  isolated.forEach((node, index) => {
    positions.set(node.id, {
      x: index * (NODE_WIDTH + NODE_SEPARATION),
      y: maxY + NODE_HEIGHT + RANK_SEPARATION,
    });
  });

  return positions;
}

/**
 * Computes dagre-ordered positions for already-converted xyflow nodes and
 * edges — the shape LearnMateCanvas manages with useNodesState/useEdgesState.
 * Isolated nodes flow in a single row beneath the graph.
 */
export function computeFlowLayout(
  nodes: HardwareNode[],
  edges: BlueprintEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) return positions;

  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }
  const connected = nodes.filter((node) => connectedIds.has(node.id));
  const isolated = nodes.filter((node) => !connectedIds.has(node.id));

  for (const [id, position] of runDagre(
    connected.map((node) => ({ id: node.id })),
    edges.map((edge) => ({ source: edge.source, target: edge.target })),
  )) {
    positions.set(id, position);
  }

  // Isolated nodes flow in a single row beneath the graph.
  const maxY = Math.max(
    0,
    ...Array.from(positions.values()).map((p) => p.y),
  );
  isolated.forEach((node, index) => {
    positions.set(node.id, {
      x: index * (NODE_WIDTH + NODE_SEPARATION),
      y: maxY + NODE_HEIGHT + RANK_SEPARATION,
    });
  });

  return positions;
}
