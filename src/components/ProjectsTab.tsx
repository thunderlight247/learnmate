'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, AlertCircle, Cpu, Plus, Layers, FlaskConical } from 'lucide-react';
import ProjectCanvas from '@/components/canvas/ProjectCanvas';
import type { ProjectGenerationResponse } from '@/types/canvas';

type GeneratedProject = ProjectGenerationResponse['project'];

interface ProjectsTabProps {
  workspaceId: string | null;
  /** Pre-filled topic from another tab (e.g. SummaryTab concept click). */
  initialTopic?: string | null;
  /** Called after the initialTopic has been consumed (auto-generation started). */
  onTopicConsumed?: () => void;
}

export default function ProjectsTab({ workspaceId, initialTopic, onTopicConsumed }: ProjectsTabProps) {
  const [topic, setTopic] = useState('');
  const [project, setProject] = useState<GeneratedProject | null>(null);
  const [existingProjects, setExistingProjects] = useState<GeneratedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consumedTopicRef = useRef<string | null>(null);

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

  // Auto-trigger blueprint generation when a concept is sent from the SummaryTab
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
      <div className="flex h-full flex-col gap-3 -m-2">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{project.title}</h3>
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
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              New Blueprint
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 px-1">
          <ProjectCanvas project={project} workspaceId={workspaceId} />
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
          placeholder="e.g. Cardiovascular & Circulatory System, Quadcopter Avionics, Nervous System..."
          disabled={loading || !workspaceId}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={loading || !topic.trim() || !workspaceId}
          className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>Generate</span>
        </button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-sm flex-col items-center rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
              <h3 className="mb-1 font-semibold text-red-800">Generation Failed</h3>
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition"
              >
                Dismiss &amp; Try Again
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex h-full flex-col items-center justify-center text-indigo-600">
            <div className="relative mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-400" />
              <FlaskConical className="absolute inset-0 m-auto h-5 w-5 text-indigo-700" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Building interactive blueprint...</p>
            {topic && (
              <p className="mt-1.5 max-w-xs text-center text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-0.5">
                &ldquo;{topic}&rdquo;
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400 text-center max-w-xs">
              Retrieving lecture context, mapping system components, and wiring connections
            </p>
          </div>
        ) : !workspaceId ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
            <Cpu className="mb-2 h-12 w-12 opacity-60" />
            <p className="text-sm">Waiting for document processing to finish...</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            {existingProjects.length > 0 ? (
              <div className="w-full max-w-md space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Existing Blueprints in this Workspace</span>
                </div>
                <div className="space-y-2">
                  {existingProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProject(p)}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
                    >
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">{p.title}</h4>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {p.nodes.length} nodes · {p.edges.length} connections
                        </p>
                      </div>
                      <span className="text-xs font-medium text-blue-600">Open Studio →</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex max-w-sm flex-col items-center text-center space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100">
                  <FlaskConical className="h-8 w-8 text-indigo-500 opacity-80" />
                </div>
                <div>
                  <p className="font-semibold text-gray-700">Turn theory into a hands-on project</p>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                    Enter any topic above, or click <strong className="text-indigo-600">Build Project</strong> on
                    a concept in the Summary tab — LearnMate generates an interactive 2D blueprint with
                    component roles, system connections, and a step-by-step lab guide.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
