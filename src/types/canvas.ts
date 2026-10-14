// Phase 6: Canvas UI type contracts.
//
// These types bridge the persisted Phase 5 blueprint graph (Prisma
// Project/CanvasNode/CanvasEdge, see src/lib/blueprint.ts) to the
// @xyflow/react renderer. The AI's node "label" travels inside the
// CanvasNode.properties JSON (the schema has no label column), so the
// persisted shape is `{ label, ...specs }`.

import { MarkerType, type Edge, type Node } from '@xyflow/react';

/** Role a blueprint node plays in the system diagram (biological or engineering). */
export type CanvasNodeType =
  // Anatomy / Biomedical / Physiology
  | 'organ'
  | 'tissue'
  | 'vessel'
  | 'nerve'
  | 'fluid'
  | 'muscle'
  | 'bone'
  // Engineering / Robotics / Aerospace
  | 'sensor'
  | 'microcontroller'
  | 'actuator'
  | 'power'
  | 'display'
  | 'communication'
  | 'storage'
  | 'mechanical'
  | 'structural'
  | 'software'
  | 'default';

/** Persisted CanvasNode row as returned by /api/projects/generate. */
export interface CanvasNodeRecord {
  id: string;
  projectId: string;
  type: string;
  positionX: number;
  positionY: number;
  properties: Record<string, unknown> | null;
}

/** Persisted CanvasEdge row as returned by /api/projects/generate. */
export interface CanvasEdgeRecord {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
}

/** Project row as returned by /api/projects/generate (billOfMaterials is JSON). */
export interface CanvasProjectRecord {
  id: string;
  workspaceId: string;
  title: string;
  billOfMaterials: unknown;
  createdAt: string;
}

/** Full API payload for POST /api/projects/generate. */
export interface ProjectGenerationResponse {
  success: boolean;
  project: CanvasProjectRecord & {
    nodes: CanvasNodeRecord[];
    edges: CanvasEdgeRecord[];
  };
}

/**
 * Data carried by every System/Hardware node. Holds rich pedagogical properties
 * including functional role, clinical/engineering importance, and failure/damage effects.
 */
export interface HardwareNodeData extends Record<string, unknown> {
  label: string;
  nodeType: CanvasNodeType;
  role?: string;
  importance?: string;
  damageEffect?: string;
  properties: Record<string, string>;
}

/** xyflow node whose `type: 'hardware'` renders HardwareNode / SystemNode. */
export type HardwareNode = Node<HardwareNodeData, 'hardware'>;

/** xyflow edge for blueprint connections (blood flow, signal, power rail, data bus). */
export type BlueprintEdge = Edge;

/** Convert one persisted CanvasNode row into an xyflow node. */
export function toFlowNode(record: CanvasNodeRecord): HardwareNode {
  const props = (record.properties ?? {}) as Record<string, unknown>;
  const label =
    typeof props.label === 'string' && props.label.trim()
      ? props.label
      : `${record.type} ${record.id.slice(0, 6)}`;

  const role = typeof props.role === 'string' && props.role.trim() ? props.role : undefined;
  const importance =
    typeof props.importance === 'string' && props.importance.trim()
      ? props.importance
      : undefined;
  const damageEffect =
    typeof props.damageEffect === 'string' && props.damageEffect.trim()
      ? props.damageEffect
      : undefined;

  // Filter out system metadata from raw properties specs table
  const { label: _l, role: _r, importance: _i, damageEffect: _d, ...rawSpecs } = props;

  return {
    id: record.id,
    type: 'hardware',
    position: { x: record.positionX, y: record.positionY },
    data: {
      label,
      nodeType: normalizeNodeType(record.type),
      role,
      importance,
      damageEffect,
      properties: stringifySpecs(rawSpecs),
    },
  };
}

/** Convert one persisted CanvasEdge row into an xyflow edge. */
export function toFlowEdge(record: CanvasEdgeRecord): BlueprintEdge {
  return {
    id: record.id,
    source: record.sourceNodeId,
    target: record.targetNodeId,
    label: record.label ?? undefined,
    animated: true,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: '#6366f1',
    },
    style: {
      strokeWidth: 2,
      stroke: '#818cf8',
    },
    labelStyle: {
      fill: '#1e293b',
      fontWeight: 600,
      fontSize: 10,
    },
    labelBgStyle: {
      fill: '#f8fafc',
      fillOpacity: 0.95,
      stroke: '#c7d2fe',
      strokeWidth: 1,
      rx: 4,
      ry: 4,
    },
    labelBgPadding: [6, 3],
  };
}

const VALID_NODE_TYPES: CanvasNodeType[] = [
  'organ',
  'tissue',
  'vessel',
  'nerve',
  'fluid',
  'muscle',
  'bone',
  'sensor',
  'microcontroller',
  'actuator',
  'power',
  'display',
  'communication',
  'storage',
  'mechanical',
  'structural',
  'software',
];

/** Coerce the AI's free-form node type to a known role, else 'default'. */
export function normalizeNodeType(type: string): CanvasNodeType {
  const normalized = type.trim().toLowerCase();
  return (VALID_NODE_TYPES as string[]).includes(normalized)
    ? (normalized as CanvasNodeType)
    : 'default';
}

/** xyflow expects renderable strings; drop/convert anything else. */
export function stringifySpecs(specs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}
