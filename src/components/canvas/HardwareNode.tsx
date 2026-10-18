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
      className={`relative w-[270px] rounded-xl border-2 bg-white shadow-sm transition-all cursor-pointer ${
        style.ring
      } ${
        selected
          ? 'shadow-xl ring-4 ring-blue-500/35 border-blue-600 scale-[1.03] z-20'
          : 'hover:shadow-md hover:border-gray-400'
      }`}
    >
      {selected && (
        <span className="absolute -top-3 right-3 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          Inspecting
        </span>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-indigo-600 !w-3.5 !h-3.5 !border-2 !border-white shadow-sm hover:scale-125 transition-transform"
      />

      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-100">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs ${style.accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900 leading-snug">
            {nodeData.label}
          </p>
          <span
            className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${style.chip}`}
          >
            {nodeData.nodeType}
          </span>
        </div>
      </div>

      {nodeData.role && (
        <p className="px-3.5 pt-2 text-xs text-gray-600 line-clamp-2 leading-relaxed font-normal">
          {nodeData.role}
        </p>
      )}

      {nodeData.damageEffect && (
        <div className="mx-3 my-2 flex items-start gap-1.5 rounded-lg bg-amber-50/90 p-2 text-xs font-medium text-amber-950 border border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
          <span className="line-clamp-2 leading-tight" title={nodeData.damageEffect}>
            <strong className="font-semibold text-amber-800">Risk:</strong> {nodeData.damageEffect}
          </span>
        </div>
      )}

      {specs.length > 0 && (
        <dl className="space-y-1 px-3.5 py-2 border-t border-gray-50 text-[11px] leading-snug">
          {specs.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="shrink-0 text-gray-400 capitalize">{key}:</dt>
              <dd className="truncate text-right font-medium text-gray-700">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="px-3 py-1 bg-gray-50/70 rounded-b-xl border-t border-gray-100 text-[11px] text-gray-400 text-center font-medium">
        Click to inspect details &amp; flows
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-indigo-600 !w-3.5 !h-3.5 !border-2 !border-white shadow-sm hover:scale-125 transition-transform"
      />
    </div>
  );
}

export default memo(HardwareNodeComponent);
