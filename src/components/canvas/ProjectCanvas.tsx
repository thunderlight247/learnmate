'use client';

// Phase 6: Blueprint view & interactive System Studio for LearnMate.
// Composes the 2D xyflow LearnMateCanvas diagram with:
// 1. Component Inspector: Deep dive into parts, clinical/engineering importance, and failure effects.
// 2. Hands-On Lab Guide: Actionable, step-by-step physical build and experiment protocol turning theory into practice.
// 3. Parts & BOM: Bill of Materials with quantities and specs.

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Package,
  Info,
  X,
  AlertTriangle,
  Heart,
  Activity,
  GitBranch,
  Zap,
  Droplet,
  Flame,
  Shield,
  Wrench,
  Cpu,
  Plug,
  Battery,
  Monitor,
  CircuitBoard,
  HardDrive,
  Cog,
  Box,
  Code,
  ArrowRight,
  Sparkles,
  Send,
  Loader2,
  Search,
  BookOpen,
  CheckCircle2,
  FlaskConical,
  CheckSquare,
  Square,
  Copy,
  Check,
  Clock,
  AlertOctagon,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import LearnMateCanvas from './LearnMateCanvas';
import {
  normalizeNodeType,
  stringifySpecs,
  type CanvasNodeType,
  type HardwareNode as HardwareNodeType,
  type ProjectGenerationResponse,
} from '@/types/canvas';
import type { HandsOnLabProtocol } from '@/app/api/projects/lab/route';

interface BomItem {
  item: string;
  quantity: number;
  description: string;
  estimatedCost: string;
}

type Project = ProjectGenerationResponse['project'];

interface ProjectCanvasProps {
  project: Project;
  workspaceId?: string | null;
}

const TYPE_CONFIG: Record<
  CanvasNodeType,
  { icon: LucideIcon; color: string; badgeBg: string; label: string }
> = {
  organ: { icon: Heart, color: 'text-rose-600', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Organ' },
  tissue: { icon: Activity, color: 'text-red-600', badgeBg: 'bg-red-50 text-red-700 border-red-200', label: 'Tissue' },
  vessel: { icon: GitBranch, color: 'text-indigo-600', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Vessel' },
  nerve: { icon: Zap, color: 'text-amber-600', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Nerve' },
  fluid: { icon: Droplet, color: 'text-sky-600', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200', label: 'Fluid' },
  muscle: { icon: Flame, color: 'text-orange-600', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Muscle' },
  bone: { icon: Shield, color: 'text-slate-600', badgeBg: 'bg-slate-50 text-slate-700 border-slate-200', label: 'Bone' },
  sensor: { icon: Wrench, color: 'text-emerald-600', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Sensor' },
  microcontroller: { icon: Cpu, color: 'text-blue-600', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Microcontroller' },
  actuator: { icon: Plug, color: 'text-orange-600', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Actuator' },
  power: { icon: Battery, color: 'text-yellow-600', badgeBg: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Power' },
  display: { icon: Monitor, color: 'text-purple-600', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Display' },
  communication: { icon: CircuitBoard, color: 'text-cyan-600', badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200', label: 'Communication' },
  storage: { icon: HardDrive, color: 'text-pink-600', badgeBg: 'bg-pink-50 text-pink-700 border-pink-200', label: 'Storage' },
  mechanical: { icon: Cog, color: 'text-zinc-600', badgeBg: 'bg-zinc-50 text-zinc-700 border-zinc-200', label: 'Mechanical' },
  structural: { icon: Box, color: 'text-stone-600', badgeBg: 'bg-stone-50 text-stone-700 border-stone-200', label: 'Structural' },
  software: { icon: Code, color: 'text-violet-600', badgeBg: 'bg-violet-50 text-violet-700 border-violet-200', label: 'Software' },
  default: { icon: Wrench, color: 'text-gray-600', badgeBg: 'bg-gray-50 text-gray-700 border-gray-200', label: 'Component' },
};

export default function ProjectCanvas({ project, workspaceId }: ProjectCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inspector' | 'lab' | 'bom'>('inspector');
  const [componentSearch, setComponentSearch] = useState('');

  // Inline AI deep-dive query states
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // Hands-on lab guide state
  const [labProtocol, setLabProtocol] = useState<HandsOnLabProtocol | null>(null);
  const [loadingLab, setLoadingLab] = useState(false);
  const [labMode, setLabMode] = useState<'hardware' | 'simulation' | 'experiment'>('hardware');
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [copiedManual, setCopiedManual] = useState(false);

  // Parse Bill of Materials
  const bom = useMemo<BomItem[]>(() => {
    if (!Array.isArray(project.billOfMaterials)) return [];
    return project.billOfMaterials.filter(
      (entry): entry is BomItem =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as BomItem).item === 'string',
    );
  }, [project.billOfMaterials]);

  // Selected node metadata
  const selectedRecord = useMemo(
    () => project.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [project.nodes, selectedNodeId],
  );

  const selectedData = useMemo(() => {
    if (!selectedRecord) return null;
    const props = (selectedRecord.properties ?? {}) as Record<string, unknown>;
    const label =
      typeof props.label === 'string' && props.label.trim()
        ? props.label
        : `${selectedRecord.type} ${selectedRecord.id.slice(0, 6)}`;
    const role = typeof props.role === 'string' && props.role.trim() ? props.role : undefined;
    const importance =
      typeof props.importance === 'string' && props.importance.trim()
        ? props.importance
        : undefined;
    const damageEffect =
      typeof props.damageEffect === 'string' && props.damageEffect.trim()
        ? props.damageEffect
        : undefined;

    const { label: _l, role: _r, importance: _i, damageEffect: _d, ...rawSpecs } = props;

    return {
      id: selectedRecord.id,
      type: normalizeNodeType(selectedRecord.type),
      rawType: selectedRecord.type,
      label,
      role,
      importance,
      damageEffect,
      specs: stringifySpecs(rawSpecs),
    };
  }, [selectedRecord]);

  // Connections where selectedNode is the target (inputs / upstream flow)
  const incomingConnections = useMemo(() => {
    if (!selectedNodeId) return [];
    return project.edges
      .filter((e) => e.targetNodeId === selectedNodeId)
      .map((e) => {
        const source = project.nodes.find((n) => n.id === e.sourceNodeId);
        const sourceProps = (source?.properties ?? {}) as Record<string, unknown>;
        const sourceLabel =
          typeof sourceProps.label === 'string' && sourceProps.label.trim()
            ? sourceProps.label
            : source
              ? `${source.type} ${source.id.slice(0, 6)}`
              : 'Unknown Component';
        return {
          edgeId: e.id,
          sourceId: e.sourceNodeId,
          sourceLabel,
          sourceType: source ? normalizeNodeType(source.type) : 'default',
          label: e.label || 'Connected flow',
        };
      });
  }, [selectedNodeId, project.edges, project.nodes]);

  // Connections where selectedNode is the source (outputs / downstream flow)
  const outgoingConnections = useMemo(() => {
    if (!selectedNodeId) return [];
    return project.edges
      .filter((e) => e.sourceNodeId === selectedNodeId)
      .map((e) => {
        const target = project.nodes.find((n) => n.id === e.targetNodeId);
        const targetProps = (target?.properties ?? {}) as Record<string, unknown>;
        const targetLabel =
          typeof targetProps.label === 'string' && targetProps.label.trim()
            ? targetProps.label
            : target
              ? `${target.type} ${target.id.slice(0, 6)}`
              : 'Unknown Component';
        return {
          edgeId: e.id,
          targetId: e.targetNodeId,
          targetLabel,
          targetType: target ? normalizeNodeType(target.type) : 'default',
          label: e.label || 'Connected flow',
        };
      });
  }, [selectedNodeId, project.edges, project.nodes]);

  // Node selection handler from Canvas
  const handleSelectNode = useCallback((node: HardwareNodeType | null) => {
    setSelectedNodeId(node ? node.id : null);
    setAiResponse(null);
    setAiQuestion('');
    if (node) {
      setActiveTab('inspector');
    }
  }, []);

  // Filtered components list for the inspector overview
  const allComponents = useMemo(() => {
    return project.nodes.map((node) => {
      const props = (node.properties ?? {}) as Record<string, unknown>;
      const label =
        typeof props.label === 'string' && props.label.trim()
          ? props.label
          : `${node.type} ${node.id.slice(0, 6)}`;
      const role = typeof props.role === 'string' ? props.role : '';
      const type = normalizeNodeType(node.type);
      return {
        id: node.id,
        label,
        role,
        type,
      };
    });
  }, [project.nodes]);

  const filteredComponents = useMemo(() => {
    if (!componentSearch.trim()) return allComponents;
    const q = componentSearch.toLowerCase();
    return allComponents.filter(
      (c) => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
    );
  }, [allComponents, componentSearch]);

  // Deep-dive AI question submission
  const handleAskAi = async (promptOverride?: string) => {
    const query = promptOverride || aiQuestion.trim();
    if (!query || !selectedData || aiLoading) return;

    setAiLoading(true);
    setAiResponse(null);

    try {
      if (workspaceId) {
        const contextualMessage = `Regarding the component "${selectedData.label}" (${selectedData.rawType}) in our blueprint: ${query}`;
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: contextualMessage,
            workspaceId,
          }),
        });
        const data = await res.json();
        if (data.response) {
          setAiResponse(data.response);
        } else if (data.answer) {
          setAiResponse(data.answer);
        } else {
          setAiResponse(data.error || 'No detailed analysis found in the workspace context.');
        }
      } else {
        setAiResponse(
          `Analysis for ${selectedData.label}:\n\n` +
            `• Role: ${selectedData.role || 'Primary active subsystem component.'}\n` +
            `• Importance: ${selectedData.importance || 'Essential for overall operational integrity.'}\n` +
            `• Damage Consequence: ${selectedData.damageEffect || 'System failure or severe operational degradation.'}`,
        );
      }
    } catch (err) {
      console.error('Error querying component AI:', err);
      setAiResponse('Unable to fetch deep-dive response. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Fetch or regenerate hands-on lab protocol
  const fetchLabProtocol = useCallback(
    async (modeToFetch: 'hardware' | 'simulation' | 'experiment' = labMode) => {
      setLoadingLab(true);
      try {
        const res = await fetch('/api/projects/lab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            workspaceId: workspaceId || 'default-workspace',
            topic: project.title,
            mode: modeToFetch,
          }),
        });

        const data = await res.json();
        if (data.lab) {
          setLabProtocol(data.lab);
          setCompletedSteps([]);
        }
      } catch (err) {
        console.error('Failed to generate hands-on lab protocol:', err);
      } finally {
        setLoadingLab(false);
      }
    },
    [project.id, project.title, workspaceId, labMode],
  );

  // Auto-fetch lab protocol on first click into lab tab
  useEffect(() => {
    if (activeTab === 'lab' && !labProtocol && !loadingLab) {
      fetchLabProtocol(labMode);
    }
  }, [activeTab, labProtocol, loadingLab, fetchLabProtocol, labMode]);

  // Step completion toggle
  const toggleStepCompletion = (stepNum: number) => {
    setCompletedSteps((prev) =>
      prev.includes(stepNum) ? prev.filter((s) => s !== stepNum) : [...prev, stepNum],
    );
  };

  // Copy lab manual as markdown
  const handleCopyLabManual = () => {
    if (!labProtocol) return;
    const md = [
      `# ${labProtocol.title}`,
      `**Objective:** ${labProtocol.objective}`,
      `**Theoretical Principle:** ${labProtocol.theoreticalPrinciple}`,
      `**Difficulty:** ${labProtocol.difficulty} | **Estimated Time:** ${labProtocol.estimatedTime}`,
      '',
      '## Required Tools & Bench Equipment',
      ...labProtocol.requiredTools.map((t) => `- ${t}`),
      '',
      '## Safety Warnings',
      ...labProtocol.safetyWarnings.map((w) => `> ⚠️ **Warning:** ${w}`),
      '',
      '## Step-by-Step Hands-On Protocol',
      ...labProtocol.steps.map((s) => [
        `### Step ${s.stepNumber}: ${s.title}`,
        s.instruction,
        s.safetyOrCaution ? `*Caution:* ${s.safetyOrCaution}` : '',
        `**Expected Outcome:** ${s.expectedOutcome}`,
        '',
      ].filter(Boolean).join('\n')),
      '## Troubleshooting & Fault Diagnostics',
      ...labProtocol.troubleshooting.map((t) => `- **Symptom:** ${t.symptom}\n  - *Cause:* ${t.cause}\n  - *Solution:* ${t.solution}`),
      '',
      '## Verification Challenge',
      labProtocol.verificationChallenge,
    ].join('\n');

    navigator.clipboard.writeText(md);
    setCopiedManual(true);
    setTimeout(() => setCopiedManual(false), 2000);
  };

  const currentConfig = selectedData ? TYPE_CONFIG[selectedData.type] : null;
  const CurrentIcon = currentConfig?.icon ?? Wrench;

  return (
    <div className="flex h-full min-h-[550px] gap-4">
      {/* 2D Interactive Diagram */}
      <div className="min-w-0 flex-1">
        <LearnMateCanvas
          project={project}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />
      </div>

      {/* Side Inspector, Hands-On Lab, & BOM Panel */}
      <aside className="flex w-84 lg:w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === 'inspector'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Info className="h-3.5 w-3.5" />
            <span className="truncate">Inspector</span>
            {selectedNodeId && (
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('lab')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === 'lab'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate">Hands-On Lab</span>
            <span className="rounded-full bg-indigo-50 px-1 py-0.2 text-[9px] font-bold text-indigo-600">
              Build
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bom')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === 'bom'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span className="truncate">Parts</span>
            <span className="rounded-full bg-gray-200 px-1.5 py-0.2 text-[10px] text-gray-700">
              {bom.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Deep-Dive Component Inspector */}
        {activeTab === 'inspector' && (
          <div className="flex flex-1 flex-col overflow-y-auto">
            {selectedData ? (
              <div className="space-y-4 p-4">
                {/* Header with Title, Type Badge, and Clear Selection */}
                <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${currentConfig?.badgeBg}`}
                    >
                      <CurrentIcon className={`h-5 w-5 ${currentConfig?.color}`} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">
                        {selectedData.label}
                      </h3>
                      <span
                        className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${currentConfig?.badgeBg}`}
                      >
                        {selectedData.rawType}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    title="Deselect node"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* System Role & Function */}
                <section className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                    <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                    <h4>System Role & Function</h4>
                  </div>
                  <p className="rounded-lg bg-gray-50/80 p-2.5 text-xs text-gray-700 leading-relaxed border border-gray-100">
                    {selectedData.role ||
                      'Active structural and functional component operating within this system subsystem.'}
                  </p>
                </section>

                {/* Clinical / Engineering Importance */}
                {selectedData.importance && (
                  <section className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                      <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                      <h4>System / Clinical Importance</h4>
                    </div>
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-xs text-indigo-950 leading-relaxed">
                      {selectedData.importance}
                    </div>
                  </section>
                )}

                {/* Critical Failure Mode & Damage Effect */}
                {selectedData.damageEffect && (
                  <section className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <h4>Critical Failure / Damage Effect</h4>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-900 leading-relaxed">
                      {selectedData.damageEffect}
                    </div>
                  </section>
                )}

                {/* Interconnected Pathways (Inputs & Outputs) */}
                <section className="space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5 text-purple-600" />
                      Interconnected Pathways
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {incomingConnections.length + outgoingConnections.length} links
                    </span>
                  </div>

                  {/* Upstream Feeders / Inputs */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                      Incoming Inputs ({incomingConnections.length})
                    </span>
                    {incomingConnections.length === 0 ? (
                      <p className="text-[11px] italic text-gray-400 pl-1">
                        Root feeder / primary origin
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {incomingConnections.map((conn) => {
                          const IconComp = TYPE_CONFIG[conn.sourceType]?.icon ?? Wrench;
                          return (
                            <button
                              key={conn.edgeId}
                              type="button"
                              onClick={() => setSelectedNodeId(conn.sourceId)}
                              className="group flex w-full items-center justify-between rounded-lg border border-gray-200/80 bg-white p-2 text-left transition hover:border-blue-400 hover:bg-blue-50/40"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <IconComp className="h-3.5 w-3.5 shrink-0 text-gray-500 group-hover:text-blue-600" />
                                <span className="truncate text-xs font-medium text-gray-800 group-hover:text-blue-700">
                                  {conn.sourceLabel}
                                </span>
                              </div>
                              <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                                {conn.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Downstream Consumers / Outputs */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                      Outgoing Outputs ({outgoingConnections.length})
                    </span>
                    {outgoingConnections.length === 0 ? (
                      <p className="text-[11px] italic text-gray-400 pl-1">
                        Terminal endpoint / end-effector
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {outgoingConnections.map((conn) => {
                          const IconComp = TYPE_CONFIG[conn.targetType]?.icon ?? Wrench;
                          return (
                            <button
                              key={conn.edgeId}
                              type="button"
                              onClick={() => setSelectedNodeId(conn.targetId)}
                              className="group flex w-full items-center justify-between rounded-lg border border-gray-200/80 bg-white p-2 text-left transition hover:border-blue-400 hover:bg-blue-50/40"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <IconComp className="h-3.5 w-3.5 shrink-0 text-gray-500 group-hover:text-blue-600" />
                                <span className="truncate text-xs font-medium text-gray-800 group-hover:text-blue-700">
                                  {conn.targetLabel}
                                </span>
                              </div>
                              <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                                {conn.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* Technical / Physiological Specifications */}
                {Object.keys(selectedData.specs).length > 0 && (
                  <section className="space-y-1.5 border-t border-gray-100 pt-3">
                    <h4 className="text-xs font-semibold text-gray-800">
                      Technical & Physiological Specs
                    </h4>
                    <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60 text-xs">
                      {Object.entries(selectedData.specs).map(([k, v]) => (
                        <div key={k} className="flex justify-between p-2">
                          <dt className="text-gray-500 font-medium">{k}</dt>
                          <dd className="font-semibold text-gray-800 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {/* AI Deep-Dive Exploration */}
                <section className="space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    <h4>Ask LearnMate AI about this part</h4>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => handleAskAi('Explain how this component interacts with connected parts')}
                      disabled={aiLoading}
                      className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Interaction details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAskAi('What clinical/engineering failure scenarios occur if damaged?')}
                      disabled={aiLoading}
                      className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Failure simulation
                    </button>
                  </div>

                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAskAi();
                        }
                      }}
                      placeholder={`Ask about ${selectedData.label}...`}
                      disabled={aiLoading}
                      className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleAskAi()}
                      disabled={aiLoading || !aiQuestion.trim()}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {aiResponse && (
                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2.5 text-xs text-gray-800 leading-relaxed whitespace-pre-line">
                      {aiResponse}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              /* Empty state: Guided list to select a component */
              <div className="flex flex-col space-y-3 p-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-center">
                  <Info className="mx-auto h-5 w-5 text-blue-600 mb-1" />
                  <p className="text-xs font-semibold text-blue-900">
                    Interactive Blueprint Inspector
                  </p>
                  <p className="mt-1 text-[11px] text-blue-700 leading-snug">
                    Click any node on the diagram to inspect its functional role, interconnected pathways, clinical/engineering importance, and failure effects.
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="Search all parts..."
                    className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    System Components ({filteredComponents.length})
                  </span>
                  <div className="space-y-1">
                    {filteredComponents.map((comp) => {
                      const cfg = TYPE_CONFIG[comp.type] ?? TYPE_CONFIG.default;
                      const CompIcon = cfg.icon;
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => setSelectedNodeId(comp.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-left transition hover:border-blue-300 hover:bg-white hover:shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${cfg.badgeBg}`}>
                              <CompIcon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-gray-900">
                                {comp.label}
                              </p>
                              {comp.role && (
                                <p className="truncate text-[10px] text-gray-500">
                                  {comp.role}
                                </p>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Hands-On Lab & Practical Build Guide */}
        {activeTab === 'lab' && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-4">
            {loadingLab ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-indigo-600">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs font-semibold">Designing Hands-On Lab Protocol...</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Synthesizing bench steps, tool requirements, and safety warnings
                </p>
              </div>
            ) : labProtocol ? (
              <>
                {/* Lab Title, Difficulty & Estimated Time */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-indigo-950 leading-snug">
                      {labProtocol.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => fetchLabProtocol(labMode)}
                      title="Regenerate Protocol"
                      className="rounded p-1 text-indigo-500 hover:bg-indigo-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="flex items-center gap-1 rounded bg-indigo-100/80 px-2 py-0.5 font-semibold text-indigo-800">
                      <Clock className="h-3 w-3" />
                      {labProtocol.estimatedTime}
                    </span>
                    <span className="rounded bg-emerald-100/80 px-2 py-0.5 font-semibold text-emerald-800">
                      {labProtocol.difficulty}
                    </span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700 capitalize">
                      {labMode} Mode
                    </span>
                  </div>

                  <p className="text-xs text-indigo-900/90 leading-relaxed pt-1">
                    <strong className="text-indigo-950 font-semibold">Objective: </strong>
                    {labProtocol.objective}
                  </p>

                  <p className="text-[11px] text-indigo-800/80 leading-relaxed border-t border-indigo-100/80 pt-1.5">
                    <strong>Theory in Action: </strong>
                    {labProtocol.theoreticalPrinciple}
                  </p>
                </div>

                {/* Lab Mode Selector */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Lab Implementation Track
                  </span>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                    {(['hardware', 'simulation', 'experiment'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setLabMode(mode);
                          fetchLabProtocol(mode);
                        }}
                        className={`rounded-md py-1.5 text-[10px] font-medium transition capitalize ${
                          labMode === mode
                            ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {mode === 'hardware'
                          ? '🛠️ Physical'
                          : mode === 'simulation'
                            ? '💻 Virtual'
                            : '🔬 Empirical'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Required Tools & Equipment */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                    <Wrench className="h-3.5 w-3.5 text-gray-600" />
                    <h4>Required Tools & Test Equipment</h4>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {labProtocol.requiredTools.map((tool, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Safety & Precaution Warnings */}
                {labProtocol.safetyWarnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <AlertOctagon className="h-3.5 w-3.5 text-amber-600" />
                      <h4>Laboratory Safety & Precautions</h4>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800 leading-snug">
                      {labProtocol.safetyWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Step-by-Step Hands-On Protocol with Checklists */}
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                      Step-by-Step Build Protocol
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {completedSteps.length} of {labProtocol.steps.length} completed
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{
                        width: `${(completedSteps.length / Math.max(labProtocol.steps.length, 1)) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="space-y-2 pt-1">
                    {labProtocol.steps.map((step) => {
                      const isDone = completedSteps.includes(step.stepNumber);
                      return (
                        <div
                          key={step.stepNumber}
                          className={`rounded-xl border p-3 transition ${
                            isDone
                              ? 'border-emerald-200 bg-emerald-50/40 opacity-80'
                              : 'border-gray-200 bg-white hover:border-indigo-300 shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleStepCompletion(step.stepNumber)}
                              className="mt-0.5 text-indigo-600 hover:text-indigo-800 transition"
                            >
                              {isDone ? (
                                <CheckSquare className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Square className="h-4 w-4 text-gray-400" />
                              )}
                            </button>
                            <div className="flex-1 space-y-1 min-w-0">
                              <p className={`text-xs font-bold ${isDone ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                Step {step.stepNumber}: {step.title}
                              </p>
                              <p className="text-xs text-gray-700 leading-relaxed">
                                {step.instruction}
                              </p>

                              {step.safetyOrCaution && (
                                <div className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800 border border-amber-200/60 font-medium">
                                  <strong>Caution: </strong> {step.safetyOrCaution}
                                </div>
                              )}

                              <div className="flex items-start gap-1 rounded bg-blue-50/60 px-2 py-1 text-[10px] text-blue-900 border border-blue-100/60">
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-blue-600 mt-0.5" />
                                <span><strong>Expected: </strong>{step.expectedOutcome}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Troubleshooting Matrix */}
                {labProtocol.troubleshooting.length > 0 && (
                  <div className="space-y-1.5 border-t border-gray-100 pt-3">
                    <h4 className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Troubleshooting & Diagnostics
                    </h4>
                    <div className="space-y-1.5">
                      {labProtocol.troubleshooting.map((t, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs space-y-0.5"
                        >
                          <p className="font-semibold text-gray-800 text-[11px]">
                            ⚠️ {t.symptom}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            <span className="font-medium text-gray-600">Cause:</span> {t.cause}
                          </p>
                          <p className="text-[10px] text-indigo-700">
                            <span className="font-medium text-indigo-800">Fix:</span> {t.solution}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verification Challenge */}
                {labProtocol.verificationChallenge && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                      <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                      <h4>Hands-On Challenge & Empirical Proof</h4>
                    </div>
                    <p className="text-xs text-purple-950 leading-relaxed">
                      {labProtocol.verificationChallenge}
                    </p>
                  </div>
                )}

                {/* Export / Copy Lab Manual Action */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCopyLabManual}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    {copiedManual ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Lab Manual Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Lab Sheet / Build Manual</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 space-y-2">
                <FlaskConical className="h-8 w-8 text-indigo-500 mx-auto opacity-70" />
                <p className="text-xs font-semibold text-gray-800">
                  Ready to turn theory into a hands-on project?
                </p>
                <button
                  type="button"
                  onClick={() => fetchLabProtocol(labMode)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow transition hover:bg-indigo-700"
                >
                  Generate Hands-On Lab Protocol
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Bill of Materials */}
        {activeTab === 'bom' && (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {bom.length === 0 ? (
              <p className="text-xs text-gray-400">
                No components listed for this project.
              </p>
            ) : (
              bom.map((entry, index) => (
                <div
                  key={`${entry.item}-${index}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {entry.item}
                    </p>
                    <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      ×{entry.quantity}
                    </span>
                  </div>
                  {entry.description && (
                    <p className="mt-1 text-xs text-gray-500">{entry.description}</p>
                  )}
                  {entry.estimatedCost && (
                    <p className="mt-1 text-xs font-medium text-gray-700">
                      {entry.estimatedCost}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <footer className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-[11px] text-gray-400">
          Click nodes to inspect · Drag to rearrange · Scroll to zoom
        </footer>
      </aside>
    </div>
  );
}
