'use client';

// Phase 6: custom xyflow node rendering one blueprint block (biological or engineering).
// The node type decides the icon + accent color; pedagogical attributes
// (role, specs, failure/damage effects) are displayed clearly for interactive study.

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Battery,
  CircuitBoard,
  Cpu,
  HardDrive,
  Monitor,
  Plug,
  Wrench,
  Heart,
  Activity,
  GitBranch,
  Zap,
  Droplet,
  Flame,
  Shield,
  Cog,
  Box,
  Code,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { CanvasNodeType, HardwareNodeData } from '@/types/canvas';

const NODE_STYLES: Record<
  CanvasNodeType,
  { icon: LucideIcon; accent: string; ring: string; chip: string }
> = {
  // Biomedical / Anatomy
  organ: {
    icon: Heart,
    accent: 'bg-rose-100 text-rose-700',
    ring: 'border-rose-300',
    chip: 'bg-rose-50 text-rose-700',
  },
  tissue: {
    icon: Activity,
    accent: 'bg-red-100 text-red-700',
    ring: 'border-red-300',
    chip: 'bg-red-50 text-red-700',
  },
  vessel: {
    icon: GitBranch,
    accent: 'bg-indigo-100 text-indigo-700',
    ring: 'border-indigo-300',
    chip: 'bg-indigo-50 text-indigo-700',
  },
  nerve: {
    icon: Zap,
    accent: 'bg-amber-100 text-amber-700',
    ring: 'border-amber-300',
    chip: 'bg-amber-50 text-amber-700',
  },
  fluid: {
    icon: Droplet,
    accent: 'bg-sky-100 text-sky-700',
    ring: 'border-sky-300',
    chip: 'bg-sky-50 text-sky-700',
  },
  muscle: {
    icon: Flame,
    accent: 'bg-orange-100 text-orange-700',
    ring: 'border-orange-300',
    chip: 'bg-orange-50 text-orange-700',
  },
  bone: {
    icon: Shield,
    accent: 'bg-slate-100 text-slate-700',
    ring: 'border-slate-300',
    chip: 'bg-slate-50 text-slate-700',
  },
  // Engineering / Robotics
  sensor: {
    icon: Wrench,
    accent: 'bg-emerald-100 text-emerald-700',
    ring: 'border-emerald-300',
    chip: 'bg-emerald-50 text-emerald-700',
  },
  microcontroller: {
    icon: Cpu,
    accent: 'bg-blue-100 text-blue-700',
    ring: 'border-blue-300',
    chip: 'bg-blue-50 text-blue-700',
  },
  actuator: {
    icon: Plug,
    accent: 'bg-orange-100 text-orange-700',
    ring: 'border-orange-300',
    chip: 'bg-orange-50 text-orange-700',
  },
  power: {
    icon: Battery,
    accent: 'bg-yellow-100 text-yellow-700',
    ring: 'border-yellow-300',
    chip: 'bg-yellow-50 text-yellow-700',
  },
  display: {
    icon: Monitor,
    accent: 'bg-purple-100 text-purple-700',
    ring: 'border-purple-300',
    chip: 'bg-purple-50 text-purple-700',
  },
  communication: {
    icon: CircuitBoard,
    accent: 'bg-cyan-100 text-cyan-700',
    ring: 'border-cyan-300',
    chip: 'bg-cyan-50 text-cyan-700',
  },
  storage: {
    icon: HardDrive,
    accent: 'bg-pink-100 text-pink-700',
    ring: 'border-pink-300',
    chip: 'bg-pink-50 text-pink-700',
  },
  mechanical: {
    icon: Cog,
    accent: 'bg-zinc-100 text-zinc-700',
    ring: 'border-zinc-300',
    chip: 'bg-zinc-50 text-zinc-700',
  },
  structural: {
    icon: Box,
    accent: 'bg-stone-100 text-stone-700',
    ring: 'border-stone-300',
    chip: 'bg-stone-50 text-stone-700',
  },
  software: {
    icon: Code,
    accent: 'bg-violet-100 text-violet-700',
    ring: 'border-violet-300',
    chip: 'bg-violet-50 text-violet-700',
  },
  default: {
    icon: Wrench,
    accent: 'bg-gray-100 text-gray-700',
    ring: 'border-gray-300',
    chip: 'bg-gray-50 text-gray-700',
  },
};

const MAX_VISIBLE_SPECS = 2;

function HardwareNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as HardwareNodeData;
  const style = NODE_STYLES[nodeData.nodeType] ?? NODE_STYLES.default;
  const Icon = style.icon;

  const specs = Object.entries(nodeData.properties).slice(
    0,
    MAX_VISIBLE_SPECS,
  );

  return (
    <div
      className={`relative w-[230px] rounded-xl border-2 bg-white shadow-sm transition-all cursor-pointer ${
        style.ring
      } ${
        selected
          ? 'shadow-xl ring-4 ring-blue-500/30 border-blue-600 scale-[1.03] z-20'
          : 'hover:shadow-md hover:border-gray-400'
      }`}
    >
      {selected && (
        <span className="absolute -top-2.5 right-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
          Inspecting
        </span>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-indigo-500 !w-2.5 !h-2.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {nodeData.label}
          </p>
          <span
            className={`inline-block rounded px-1.5 text-[10px] font-medium uppercase tracking-wide ${style.chip}`}
          >
            {nodeData.nodeType}
          </span>
        </div>
      </div>

      {nodeData.role && (
        <p className="px-3 pt-1.5 text-[11px] text-gray-600 line-clamp-2 leading-tight">
          {nodeData.role}
        </p>
      )}

      {nodeData.damageEffect && (
        <div className="mx-2.5 my-1.5 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-900 border border-amber-200/60">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
          <span className="truncate" title={nodeData.damageEffect}>
            Failure: {nodeData.damageEffect}
          </span>
        </div>
      )}

      {specs.length > 0 && (
        <dl className="space-y-0.5 px-3 py-1.5 border-t border-gray-50 text-[10px] leading-snug">
          {specs.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="shrink-0 text-gray-400">{key}</dt>
              <dd className="truncate text-right font-medium text-gray-600">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="px-3 py-1 bg-gray-50/60 rounded-b-xl border-t border-gray-100 text-[10px] text-gray-400 text-center">
        Click to inspect component
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-indigo-500 !w-2.5 !h-2.5"
      />
    </div>
  );
}

export default memo(HardwareNodeComponent);
