'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, AlertCircle, Cpu, Plus, Layers, FlaskConical } from 'lucide-react';
import ProjectCanvas from '@/components/canvas/ProjectCanvas';
import type { ProjectGenerationResponse } from '@/types/canvas';

type GeneratedProject = ProjectGenerationResponse['project'];

interface ProjectsTabProps {
  workspaceId: string | null;
  /** Pre-filled topic from another tab (e.g. SummaryTab concept click or Reason With Me). */
  initialTopic?: string | null;
  /** Called after the initialTopic has been consumed (auto-generation started). */
  onTopicConsumed?: () => void;
  /** Optional handler to append content into the persistent laboratory notepad */
  onSendToNotepad?: (content: string) => void;
  /** Explicit project selected from the Project Library */
  selectedProject?: GeneratedProject | null;
}

export default function ProjectsTab({
  workspaceId,
  initialTopic,
  onTopicConsumed,
  onSendToNotepad,
  selectedProject,
}: ProjectsTabProps) {
  const [topic, setTopic] = useState('');
  const [project, setProject] = useState<GeneratedProject | null>(null);
  const [existingProjects, setExistingProjects] = useState<GeneratedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consumedTopicRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedProject) {
      setProject(selectedProject);
    }
  }, [selectedProject]);

  // Load any previously persisted blueprints for this workspace
  useEffect(() => {
    if (!workspaceId) return;

    let isMounted = true;
    async function loadProjects() {
      try {
        setLoadingExisting(true);
        const res = await fetch(`/api/projects?workspaceId=${workspaceId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (isMounted && Array.isArray(data.projects) && data.projects.length > 0) {
          setExistingProjects(data.projects);
          // Default to the newest blueprint if none is currently selected
          setProject((current) => current ?? data.projects[0]);
        }
      } catch (err) {
        console.error('Failed to load existing projects:', err);
      } finally {
        if (isMounted) setLoadingExisting(false);
      }
    }

    loadProjects();
    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const generateFromTopic = useCallback(async (topicToGenerate: string) => {
    if (!workspaceId || !topicToGenerate.trim() || loading) return;

    setLoading(true);
    setError(null);
    setProject(null);

    try {
      const response = await fetch('/api/projects/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, topic: topicToGenerate.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate the project blueprint.');
      }

      const newProject = data.project as GeneratedProject;
      setProject(newProject);
      setExistingProjects((prev) => [newProject, ...prev.filter((p) => p.id !== newProject.id)]);
      setTopic('');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, loading]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await generateFromTopic(topic);
  };

  // Auto-trigger blueprint generation when a concept is sent from SummaryTab or ReasonWithMe
  useEffect(() => {
    if (
      initialTopic &&
      initialTopic.trim() &&
      workspaceId &&
      !loading &&
      consumedTopicRef.current !== initialTopic
    ) {
      consumedTopicRef.current = initialTopic;
      setTopic(initialTopic);
      onTopicConsumed?.();
      generateFromTopic(initialTopic);
    }
  }, [initialTopic, workspaceId, loading, onTopicConsumed, generateFromTopic]);

  if (project) {
    return (
      <div className="flex h-full flex-col gap-2 -m-1">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 rounded-lg shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{project.title}</h3>
              <p className="text-[11px] text-gray-400">
                {project.nodes.length} nodes · {project.edges.length} connections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {existingProjects.length > 1 && (
              <select
                value={project.id}
                onChange={(e) => {
                  const selected = existingProjects.find((p) => p.id === e.target.value);
                  if (selected) setProject(selected);
                }}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              >
                {existingProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setProject(null)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              <span>New Blueprint</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <ProjectCanvas
            project={project}
            workspaceId={workspaceId}
            onSendToNotepad={onSendToNotepad}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={handleGenerate} className="flex gap-2 pb-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Cardiovascular & Circulatory System, Quadcopter Avionics, Nervous System, Solar Purifier..."
          disabled={loading || !workspaceId}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={loading || !topic.trim() || !workspaceId}
          className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 text-xs shadow-sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>{loading ? 'Generating Blueprint...' : 'Generate System'}</span>
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-800">Generation Failed</h4>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {loadingExisting ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-xs">Loading existing blueprints...</span>
        </div>
      ) : existingProjects.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-3">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Saved Blueprints ({existingProjects.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {existingProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProject(p)}
                className="flex flex-col items-start p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-md transition text-left space-y-1"
              >
                <div className="flex items-center space-x-2 text-blue-600 font-semibold text-sm">
                  <Cpu className="h-4 w-4" />
                  <span>{p.title}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {p.nodes.length} nodes · {p.edges.length} connections ·{' '}
                  {Array.isArray(p.billOfMaterials) ? p.billOfMaterials.length : 0} parts
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center p-6 space-y-2">
          <Layers className="h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">No blueprint generated yet</p>
          <p className="text-xs text-gray-400 max-w-sm">
            Enter a topic above or click "Build a Project" from the document summary or "Reason With Me" ideation.
          </p>
        </div>
      )}
    </div>
  );
}
