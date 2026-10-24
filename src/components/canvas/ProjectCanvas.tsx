'use client';

// Phase 6: Blueprint view & interactive System Studio for LearnMate.
// Composes the 2D xyflow LearnMateCanvas diagram with:
// 1. Component Inspector: Deep dive into parts, clinical/engineering importance, and failure effects.
// 2. Specialized Hands-On Labs:
//    - Physical: Real-world bench build, wiring, and multimeter tests.
//    - Virtual: In-browser interactive simulator + FreeCAD (Python) & AutoCAD (AutoLISP) script generator + external tool guide.
//    - Empirical: Scientific hypothesis testing, variable isolation, and interactive live data logging.
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
  PanelRightClose,
  PanelRightOpen,
  Sliders,
  Download,
  type LucideIcon,
} from 'lucide-react';
import LearnMateCanvas from './LearnMateCanvas';
import VirtualLabWorkbench from './VirtualLabWorkbench';
import EmpiricalLabWorkbench from './EmpiricalLabWorkbench';
import PhysicalLabWorkbench from './PhysicalLabWorkbench';
import {
  normalizeNodeType,
  stringifySpecs,
  type CanvasNodeType,
  type HardwareNode as HardwareNodeType,
  type ProjectGenerationResponse,
} from '@/types/canvas';
import type {
  HandsOnLabProtocol,
  PhysicalLabProtocol,
  VirtualLabProtocol,
  EmpiricalLabProtocol,
  LabTrackMode,
} from '@/types/lab';

interface BomItem {
  item: string;
  quantity?: number;
  description?: string;
  estimatedCost?: string;
}

interface ProjectCanvasProps {
  project: ProjectGenerationResponse['project'];
  workspaceId?: string | null;
  onSendToNotepad?: (content: string) => void;
}

interface ComponentConfig {
  icon: LucideIcon;
  badgeBg: string;
  category: 'Biomedical / Anatomical' | 'Hardware / Engineering' | 'Core Structural';
}

const COMPONENT_CONFIGS: Record<CanvasNodeType, ComponentConfig> = {
  organ: { icon: Heart, badgeBg: 'bg-rose-50 text-rose-600 border-rose-200', category: 'Biomedical / Anatomical' },
  tissue: { icon: Activity, badgeBg: 'bg-pink-50 text-pink-600 border-pink-200', category: 'Biomedical / Anatomical' },
  vessel: { icon: GitBranch, badgeBg: 'bg-red-50 text-red-600 border-red-200', category: 'Biomedical / Anatomical' },
  nerve: { icon: Zap, badgeBg: 'bg-amber-50 text-amber-600 border-amber-200', category: 'Biomedical / Anatomical' },
  fluid: { icon: Droplet, badgeBg: 'bg-blue-50 text-blue-600 border-blue-200', category: 'Biomedical / Anatomical' },
  muscle: { icon: Flame, badgeBg: 'bg-orange-50 text-orange-600 border-orange-200', category: 'Biomedical / Anatomical' },
  bone: { icon: Shield, badgeBg: 'bg-slate-50 text-slate-600 border-slate-200', category: 'Biomedical / Anatomical' },

  sensor: { icon: Cpu, badgeBg: 'bg-cyan-50 text-cyan-600 border-cyan-200', category: 'Hardware / Engineering' },
  microcontroller: { icon: CircuitBoard, badgeBg: 'bg-indigo-50 text-indigo-600 border-indigo-200', category: 'Hardware / Engineering' },
  actuator: { icon: Cog, badgeBg: 'bg-emerald-50 text-emerald-600 border-emerald-200', category: 'Hardware / Engineering' },
  power: { icon: Battery, badgeBg: 'bg-amber-50 text-amber-600 border-amber-200', category: 'Hardware / Engineering' },
  display: { icon: Monitor, badgeBg: 'bg-violet-50 text-violet-600 border-violet-200', category: 'Hardware / Engineering' },
  communication: { icon: Plug, badgeBg: 'bg-sky-50 text-sky-600 border-sky-200', category: 'Hardware / Engineering' },
  storage: { icon: HardDrive, badgeBg: 'bg-teal-50 text-teal-600 border-teal-200', category: 'Hardware / Engineering' },
  software: { icon: Code, badgeBg: 'bg-purple-50 text-purple-600 border-purple-200', category: 'Hardware / Engineering' },

  mechanical: { icon: Wrench, badgeBg: 'bg-blue-50 text-blue-600 border-blue-200', category: 'Core Structural' },
  structural: { icon: Box, badgeBg: 'bg-gray-50 text-gray-600 border-gray-200', category: 'Core Structural' },
  default: { icon: Wrench, badgeBg: 'bg-gray-50 text-gray-600 border-gray-200', category: 'Core Structural' },
};

export default function ProjectCanvas({ project, workspaceId, onSendToNotepad }: ProjectCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inspector' | 'lab' | 'bom'>('inspector');
  const [componentSearch, setComponentSearch] = useState('');
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  // Inline AI deep-dive query states
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // Hands-on lab guide state
  const [labProtocol, setLabProtocol] = useState<HandsOnLabProtocol | null>(null);
  const [loadingLab, setLoadingLab] = useState(false);
  const [labMode, setLabMode] = useState<LabTrackMode>('simulation');

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

  // Node selection handler from Canvas
  const handleSelectNode = useCallback((node: HardwareNodeType | null) => {
    setSelectedNodeId(node ? node.id : null);
    setAiResponse(null);
    setAiQuestion('');
    if (node) {
      setIsInspectorCollapsed(false);
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
    async (modeToFetch: LabTrackMode = labMode) => {
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

  const handleDownloadFullReport = () => {
    const lines: string[] = [
      `# LearnMate Engineering Laboratory Report: ${project.title}`,
      `Generated on: ${new Date().toLocaleString()}`,
      '',
      '## 1. System Overview & Architecture',
      `- Total Subsystems/Nodes: ${project.nodes.length}`,
      `- Interconnection Flows: ${project.edges.length}`,
      '',
      '### Subsystem Components',
      ...project.nodes.map((n) => {
        const p = (n.properties ?? {}) as Record<string, unknown>;
        return `- **${p.label || n.type}** (${n.type}): ${p.role || 'Active subsystem'}${
          p.importance ? ` [Importance: ${p.importance}]` : ''
        }`;
      }),
      '',
      '## 2. Bill of Materials (BOM)',
      '| Item | Quantity | Description | Estimated Cost |',
      '|---|---|---|---|',
      ...bom.map((b) => `| ${b.item} | ${b.quantity ?? 1} | ${b.description || 'N/A'} | ${b.estimatedCost || 'N/A'} |`),
      '',
    ];

    if (labProtocol) {
      lines.push(
        `## 3. Hands-On Laboratory Protocol (${labProtocol.mode.toUpperCase()})`,
        `**Title:** ${labProtocol.title}`,
        `**Objective:** ${labProtocol.objective}`,
        `**Theoretical Principle:** ${labProtocol.theoreticalPrinciple}`,
        `**Estimated Duration:** ${labProtocol.estimatedTime}`,
        `**Difficulty Level:** ${labProtocol.difficulty}`,
        '',
      );

      if (labProtocol.mode === 'simulation') {
        const v = labProtocol as VirtualLabProtocol;
        lines.push(
          '### FreeCAD Parametric Macro Script',
          '```python',
          v.cadExports.freeCadMacro,
          '```',
          '',
          '### AutoCAD AutoLISP Script',
          '```lisp',
          v.cadExports.autoCadScript,
          '```',
          '',
          '### External CAD Software Implementation Steps',
          ...v.externalSoftwareGuide.steps.map(
            (s) => `#### Step ${s.stepNumber}: ${s.actionTitle}\n${s.instruction} (${s.softwareFeature})`,
          ),
          '',
        );
      } else if (labProtocol.mode === 'experiment') {
        const e = labProtocol as EmpiricalLabProtocol;
        lines.push(
          `**Null Hypothesis (H0):** ${e.hypothesisH0}`,
          `**Alternative Hypothesis (H1):** ${e.hypothesisH1}`,
          '',
          '### Scientific Variables',
          `- Independent: ${e.variableMatrix.independent.name} (${e.variableMatrix.independent.unit})`,
          `- Dependent: ${e.variableMatrix.dependent.name} (${e.variableMatrix.dependent.unit})`,
          `- Controlled: ${e.variableMatrix.controlled.join(', ')}`,
          '',
          '### Observational Data Trial Schema',
          '| Trial | Input (X) | Expected (Y) |',
          '|---|---|---|',
          ...e.suggestedTrials.map((t) => `| #${t.trialNumber} | ${t.inputVal} | ${t.expectedVal} |`),
          '',
        );
      } else {
        const p = labProtocol as PhysicalLabProtocol;
        lines.push(
          '### Step-by-Step Physical Build',
          ...p.steps.map((s) => `#### Step ${s.stepNumber}: ${s.title}\n${s.instruction}\n- Expected: ${s.expectedOutcome}`),
          '',
          '### Troubleshooting Fault Diagnostics',
          ...p.troubleshooting.map((t) => `- **${t.symptom}:** ${t.solution} (Cause: ${t.cause})`),
          '',
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LearnMate-Lab-Report-${project.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentConfig = selectedData ? COMPONENT_CONFIGS[selectedData.type] : null;
  const CurrentIcon = currentConfig?.icon ?? Wrench;

  return (
    <div className="relative flex h-full min-h-[500px] gap-3 overflow-hidden">
      {/* 2D Interactive Diagram Surface */}
      <div className="min-w-0 flex-1 relative h-full">
        <LearnMateCanvas
          project={project}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        {/* Collapsed Inspector Drawer Toggle Button */}
        {isInspectorCollapsed && (
          <button
            type="button"
            onClick={() => setIsInspectorCollapsed(false)}
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-md backdrop-blur-sm hover:bg-gray-50 hover:text-blue-600 transition"
          >
            <PanelRightOpen className="h-4 w-4" />
            <span>Open Studio Inspector & Labs</span>
          </button>
        )}
      </div>

      {/* Side Inspector, Hands-On Lab, & BOM Panel */}
      {!isInspectorCollapsed && (
        <aside className="flex w-84 lg:w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all">
          {/* Header Navigation Tabs with Collapse Button */}
          <div className="flex items-center border-b border-gray-200 bg-gray-50/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition ${
                activeTab === 'inspector'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Info className="h-3.5 w-3.5" />
              <span className="truncate">Inspector</span>
              {selectedNodeId && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lab')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition ${
                activeTab === 'lab'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5 text-indigo-500" />
              <span className="truncate">Hands-On Lab</span>
              <span className="rounded-full bg-indigo-50 px-1 py-0.2 text-[9px] font-bold text-indigo-600">
                Live
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bom')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition ${
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

            {/* Collapse Panel Button */}
            <button
              type="button"
              onClick={() => setIsInspectorCollapsed(true)}
              title="Collapse Panel for Full Canvas Space"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition ml-0.5"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>

          {/* TAB 1: DEEP-DIVE COMPONENT INSPECTOR */}
          {activeTab === 'inspector' && (
            <div className="flex flex-1 flex-col overflow-y-auto">
              {selectedData ? (
                <div className="space-y-4 p-4">
                  {/* Header with Title and Type */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${currentConfig?.badgeBg}`}
                      >
                        <CurrentIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 leading-snug">
                          {selectedData.label}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            {selectedData.rawType}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-[10px] text-gray-500 font-medium">
                            {currentConfig?.category}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(null)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                      title="Clear Selection"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Primary Role */}
                  {selectedData.role && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <Wrench className="h-3.5 w-3.5 text-blue-600" />
                        <h4>Primary Functional Role</h4>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed pl-5">
                        {selectedData.role}
                      </p>
                    </div>
                  )}

                  {/* System Importance */}
                  {selectedData.importance && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                        <Heart className="h-3.5 w-3.5 text-indigo-600" />
                        <h4>Functional & Clinical Importance</h4>
                      </div>
                      <p className="text-xs text-indigo-950/90 leading-relaxed pl-5">
                        {selectedData.importance}
                      </p>
                    </div>
                  )}

                  {/* Damage & Failure Consequence */}
                  {selectedData.damageEffect && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <h4>Damage Effect / Failure Mode</h4>
                      </div>
                      <p className="text-xs text-amber-950/90 leading-relaxed pl-5">
                        {selectedData.damageEffect}
                      </p>
                    </div>
                  )}

                  {/* Technical Specs */}
                  {Object.keys(selectedData.specs).length > 0 && (
                    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                        <Sliders className="h-3.5 w-3.5 text-gray-600" />
                        <h4>Component Specifications</h4>
                      </div>
                      <div className="divide-y divide-gray-100 text-xs">
                        {Object.entries(selectedData.specs).map(([k, v]) => (
                          <div key={k} className="flex justify-between py-1.5">
                            <span className="text-gray-500 capitalize">{k}</span>
                            <span className="font-mono text-gray-900 font-medium">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ask AI Contextual Question */}
                  <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                      <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                      <h4>Ask AI About This Component</h4>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={aiQuestion}
                        onChange={(e) => setAiQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAskAi()}
                        placeholder={`Ask anything about ${selectedData.label}...`}
                        className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAskAi()}
                        disabled={!aiQuestion.trim() || aiLoading}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {aiResponse && (
                      <div className="rounded-lg bg-blue-50/70 p-3 text-xs text-blue-950 whitespace-pre-line leading-relaxed border border-blue-100">
                        {aiResponse}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Overview List of All Components */
                <div className="flex flex-col space-y-3 p-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      System Subsystems & Nodes
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      Select any node on the canvas to inspect its role, failure modes, and equations.
                    </p>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      placeholder="Search components by name or type..."
                      className="w-full rounded-lg border border-gray-200 bg-gray-50/80 py-2 pl-8 pr-3 text-xs focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Component Cards */}
                  <div className="space-y-1.5 overflow-y-auto max-h-[460px] pr-1">
                    {filteredComponents.map((comp) => {
                      const cfg = COMPONENT_CONFIGS[comp.type];
                      const Icon = cfg?.icon ?? Wrench;
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => setSelectedNodeId(comp.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-left transition hover:border-blue-300 hover:bg-white hover:shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${cfg.badgeBg}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">
                                {comp.label}
                              </p>
                              {comp.role && (
                                <p className="text-[10px] text-gray-500 truncate">{comp.role}</p>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SPECIALIZED HANDS-ON LABS */}
          {activeTab === 'lab' && (
            <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-4">
              {/* Header Title & Track Switcher */}
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-blue-50/60 p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-indigo-950 leading-snug">
                      {labProtocol?.title || `${project.title} Hands-On Lab`}
                    </h3>
                    <p className="text-[11px] text-indigo-700/80 mt-0.5">
                      {labMode === 'simulation'
                        ? 'Interactive In-Browser Simulator & External CAD Generator (FreeCAD/AutoCAD)'
                        : labMode === 'experiment'
                        ? 'Scientific Hypothesis Testing & Live Data Logging Table'
                        : 'Real-World Hardware Bench Assembly, Wiring, & Tools'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchLabProtocol(labMode)}
                    title="Regenerate Protocol"
                    className="rounded p-1 text-indigo-600 hover:bg-indigo-100 transition shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Lab Mode Selector Buttons */}
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-200/80 p-1">
                  {(['simulation', 'hardware', 'experiment'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setLabMode(mode);
                        fetchLabProtocol(mode);
                      }}
                      className={`rounded-md py-1.5 text-xs font-semibold transition ${
                        labMode === mode
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {mode === 'simulation'
                        ? '💻 Virtual CAD'
                        : mode === 'hardware'
                        ? '🛠️ Physical'
                        : '🔬 Empirical'}
                    </button>
                  ))}
                </div>
              </div>

              {loadingLab ? (
                <div className="flex h-64 flex-col items-center justify-center text-center text-indigo-600">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-xs font-semibold">Designing {labMode.toUpperCase()} Protocol...</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {labMode === 'simulation'
                      ? 'Synthesizing FreeCAD Python macros, AutoCAD scripts, and live simulator parameters'
                      : labMode === 'experiment'
                      ? 'Formulating null/alternative hypotheses and observational data logger'
                      : 'Preparing benchtop assembly steps, pinout specs, and safety precautions'}
                  </p>
                </div>
              ) : labProtocol ? (
                <>
                  {labMode === 'simulation' && labProtocol.mode === 'simulation' ? (
                    <VirtualLabWorkbench
                      protocol={labProtocol as VirtualLabProtocol}
                      onSendToNotepad={onSendToNotepad}
                    />
                  ) : labMode === 'experiment' && labProtocol.mode === 'experiment' ? (
                    <EmpiricalLabWorkbench
                      protocol={labProtocol as EmpiricalLabProtocol}
                      onSendToNotepad={onSendToNotepad}
                    />
                  ) : (
                    <PhysicalLabWorkbench
                      protocol={labProtocol as PhysicalLabProtocol}
                      onSendToNotepad={onSendToNotepad}
                    />
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* TAB 3: BILL OF MATERIALS */}
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
                        ×{entry.quantity ?? 1}
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

          <footer className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-[11px] text-gray-500 flex items-center justify-between gap-2">
            <span className="truncate">Click nodes to inspect · Scroll to zoom</span>
            <button
              type="button"
              onClick={handleDownloadFullReport}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition shrink-0"
              title="Download complete engineering report bundle"
            >
              <Download className="h-3 w-3" />
              <span>Export Report</span>
            </button>
          </footer>
        </aside>
      )}
    </div>
  );
}
