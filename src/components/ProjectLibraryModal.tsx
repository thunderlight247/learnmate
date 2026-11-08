'use client';

// Project & Laboratory Library Manager:
// Provides a centralized hub to browse, search, categorize, export,
// and manage all saved blueprint projects and lab protocols.

import { useState, useMemo, useEffect } from 'react';
import {
  FolderOpen,
  Search,
  Trash2,
  Download,
  Cpu,
  Layers,
  ArrowRight,
  X,
  Plus,
  Loader2,
  Calendar,
  Package,
} from 'lucide-react';
import type { ProjectGenerationResponse } from '@/types/canvas';

type Project = ProjectGenerationResponse['project'];

interface ProjectLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string | null;
  onSelectProject: (project: Project) => void;
  onNewBlueprint: () => void;
}

export type SubjectCategory =
  | 'All'
  | 'Robotics'
  | 'Biomedical'
  | 'CAD & Mechanics'
  | 'Electronics'
  | 'Fluid Dynamics'
  | 'General';

export default function ProjectLibraryModal({
  isOpen,
  onClose,
  workspaceId,
  onSelectProject,
  onNewBlueprint,
}: ProjectLibraryModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SubjectCategory>('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Key for the active library request. When it changes (opened, or workspace switched),
  // loading is marked during render so the effect below only performs async work.
  const requestKey = isOpen && workspaceId ? workspaceId : null;
  const [prevRequestKey, setPrevRequestKey] = useState<string | null>(requestKey);
  if (requestKey !== prevRequestKey) {
    setPrevRequestKey(requestKey);
    if (requestKey) {
      setLoading(true);
    } else {
      setProjects([]);
    }
  }

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const url = `/api/projects?workspaceId=${encodeURIComponent(requestKey)}`;
        const res = await fetch(url);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.projects)) {
            setProjects(data.projects);
          }
        }
      } catch (err) {
        console.error('Failed to load project library:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Derive Subject Category from project title and component types
  const getProjectCategory = (p: Project): SubjectCategory => {
    const text = `${p.title} ${p.nodes.map((n) => n.type).join(' ')}`.toLowerCase();
    if (text.includes('robot') || text.includes('motor') || text.includes('drone') || text.includes('avionics')) {
      return 'Robotics';
    }
    if (
      text.includes('cardio') ||
      text.includes('heart') ||
      text.includes('blood') ||
      text.includes('organ') ||
      text.includes('cell') ||
      text.includes('hemodynamic')
    ) {
      return 'Biomedical';
    }
    if (
      text.includes('cad') ||
      text.includes('freecad') ||
      text.includes('autocad') ||
      text.includes('chassis') ||
      text.includes('mechanical') ||
      text.includes('gripper')
    ) {
      return 'CAD & Mechanics';
    }
    if (text.includes('circuit') || text.includes('sensor') || text.includes('voltage') || text.includes('microcontroller')) {
      return 'Electronics';
    }
    if (text.includes('fluid') || text.includes('flow') || text.includes('pressure') || text.includes('pipe')) {
      return 'Fluid Dynamics';
    }
    return 'General';
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const cat = getProjectCategory(p);
      const matchesCategory = selectedCategory === 'All' || cat === selectedCategory;
      const matchesSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nodes.some((n) => n.type.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [projects, searchQuery, selectedCategory]);

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this blueprint project?')) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects?projectId=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportProjectReport = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const bomItems = Array.isArray(p.billOfMaterials) ? p.billOfMaterials : [];

    const lines = [
      `# LearnMate Laboratory Report: ${p.title}`,
      `Category: ${getProjectCategory(p)}`,
      `Created: ${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Active Session'}`,
      '',
      '## 1. System Subsystems & Interconnections',
      `- Total Subsystems / Nodes: ${p.nodes.length}`,
      `- Flow Interconnections: ${p.edges.length}`,
      '',
      '### Subsystems',
      ...p.nodes.map((n) => {
        const props = (n.properties ?? {}) as Record<string, unknown>;
        return `- **${props.label || n.type}** (${n.type}): ${props.role || 'Active subsystem component'}`;
      }),
      '',
      '## 2. Bill of Materials (BOM)',
      '| Item | Quantity | Description | Estimated Cost |',
      '|---|---|---|---|',
      ...bomItems.map((b: { item?: string; quantity?: number; description?: string; estimatedCost?: string }) => `| ${b.item || 'Part'} | ${b.quantity ?? 1} | ${b.description || 'N/A'} | ${b.estimatedCost || 'N/A'} |`),
      '',
      '## 3. Laboratory Synthesis & Practice',
      'This blueprint is ready for CAD synthesis in FreeCAD / AutoCAD and empirical testing in the LearnMate System Studio.',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LearnMate-Report-${p.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/90 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Project &amp; Laboratory Library</h2>
              <p className="text-xs text-gray-500">
                Browse, search, export, and manage your engineering blueprints and protocols
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewBlueprint();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Blueprint</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="border-b border-gray-200 bg-white p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search blueprints by title, component, or category..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50/70 py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <span className="text-xs text-gray-500 font-medium self-center">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'} found
            </span>
          </div>

          {/* Subject Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {(
              [
                'All',
                'Robotics',
                'Biomedical',
                'CAD & Mechanics',
                'Electronics',
                'Fluid Dynamics',
                'General',
              ] as SubjectCategory[]
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1 font-semibold transition shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content: Project Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center text-gray-400 space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="text-xs">Loading project blueprints...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6 space-y-2">
              <Layers className="h-10 w-10 text-gray-300" />
              <h4 className="text-sm font-bold text-gray-700">No Projects Found</h4>
              <p className="text-xs text-gray-400 max-w-sm">
                {searchQuery
                  ? `No projects match "${searchQuery}". Try clearing filters.`
                  : 'Start by uploading a document or clicking "Reason With Me" to generate your first blueprint.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((p) => {
                const category = getProjectCategory(p);
                const bomCount = Array.isArray(p.billOfMaterials) ? p.billOfMaterials.length : 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p);
                      onClose();
                    }}
                    className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition hover:border-blue-400 hover:shadow-md cursor-pointer"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700 border border-blue-100">
                          {category}
                        </span>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => handleExportProjectReport(p, e)}
                            title="Export Lab Report Bundle (.md)"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(p.id, e)}
                            disabled={deletingId === p.id}
                            title="Delete Blueprint"
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition leading-snug">
                        {p.title}
                      </h3>

                      {p.createdAt && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3.5 w-3.5 text-indigo-500" />
                          <strong className="text-gray-700">{p.nodes.length}</strong> nodes
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-blue-500" />
                          <strong className="text-gray-700">{bomCount}</strong> parts
                        </span>
                      </div>

                      <span className="flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
                        <span>Open Studio</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 flex items-center justify-between text-xs text-gray-500">
          <span>Click any blueprint to immediately inspect its 2D canvas &amp; virtual labs</span>
          <button
            type="button"
            onClick={onClose}
            className="font-medium text-gray-700 hover:underline"
          >
            Close Library
          </button>
        </div>
      </div>
    </div>
  );
}
