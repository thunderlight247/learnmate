'use client';

// Main dashboard shell that owns the uploaded document state, "Reason With Me" ideation,
// Project Library manager, Settings (Bring-Your-Own-Key / Ollama), and coordinates learning tabs.
import { useSyncExternalStore, useState, useCallback, useRef, useEffect } from 'react';
import {
  AlertCircle,
  BookOpen,
  Cpu,
  FileText,
  HelpCircle,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  Trash2,
  Mic,
  FolderOpen,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import SummaryTab from '@/components/SummaryTab';
import ChatTab from '@/components/ChatTab';
import QuizTab from '@/components/QuizTab';
import ProjectsTab from '@/components/ProjectsTab';
import ReasonWithMeModal from '@/components/ReasonWithMeModal';
import ResetConfirmModal from '@/components/ResetConfirmModal';
import NotepadDrawer from '@/components/NotepadDrawer';
import SettingsModal from '@/components/SettingsModal';
import ProjectLibraryModal from '@/components/ProjectLibraryModal';
import { DocumentAnalysis } from '@/types';
import type { ProjectGenerationResponse } from '@/types/canvas';

type Project = ProjectGenerationResponse['project'];

/** localStorage key holding the last active workspace across page reloads. */
const ACTIVE_WORKSPACE_KEY = 'learnmate_active_workspace';

interface SavedWorkspace {
  workspaceId: string | null;
  fileName: string | null;
  savedAt: string | null;
  analysis: DocumentAnalysis | null;
  rawText: string | null;
}

const workspaceStore = (() => {
  let snapshot: SavedWorkspace | null | undefined;
  const listeners = new Set<() => void>();

  const read = (): SavedWorkspace | null => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      if (!saved) return null;

      const parsed = JSON.parse(saved) as Partial<SavedWorkspace> | null;
      const wsId = typeof parsed?.workspaceId === 'string' ? parsed.workspaceId.trim() : null;
      const analysis = parsed?.analysis;
      return {
        workspaceId: wsId || null,
        fileName: typeof parsed?.fileName === 'string' ? parsed.fileName : null,
        savedAt: typeof parsed?.savedAt === 'string' ? parsed.savedAt : null,
        analysis: analysis && typeof analysis.summary === 'string' && Array.isArray(analysis.keyConcepts) && Array.isArray(analysis.importantTopics) ? analysis : null,
        rawText: typeof parsed?.rawText === 'string' ? parsed.rawText : null,
      };
    } catch {
      return null;
    }
  };

  const notify = (): void => {
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): SavedWorkspace | null {
      if (snapshot === undefined) snapshot = read();
      return snapshot;
    },
    getServerSnapshot(): null {
      return null;
    },
    write(entry: Partial<SavedWorkspace>): void {
      const next: SavedWorkspace = {
        workspaceId: null, fileName: null, analysis: null, rawText: null,
        ...snapshot, ...entry, savedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(next));
      } catch {
        console.warn('Could not save the study session in browser storage.');
      }
      snapshot = next;
      notify();
    },
    clear(): void {
      try {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      } catch {
        // ignore
      }
      snapshot = null;
      notify();
    },
  };
})();

export default function Workspace() {
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'quiz' | 'projects'>('summary');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const sessionGeneration = useRef(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [ragError, setRagError] = useState<boolean>(false);
  const [isIndexingRag, setIsIndexingRag] = useState<boolean>(false);
  const [pendingProjectTopic, setPendingProjectTopic] = useState<string | null>(null);
  const [selectedLibraryProject, setSelectedLibraryProject] = useState<Project | null>(null);

  // Modals & Drawers
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [appendNoteText, setAppendNoteText] = useState<string | null>(null);

  const savedWorkspace = useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getServerSnapshot,
  );

  const effectiveWorkspaceId = workspaceId ?? savedWorkspace?.workspaceId ?? null;

  const effectiveAnalysis = analysis ?? savedWorkspace?.analysis ?? null;
  const effectiveRawText = rawText ?? savedWorkspace?.rawText ?? null;
  const hasDocument = !!file || !!effectiveAnalysis;
  const displayTab =
    activeTab === 'summary' && !hasDocument && effectiveWorkspaceId ? 'projects' : activeTab;

  const headerDocumentName = file?.name ?? savedWorkspace?.fileName ?? null;

  const tabs: Array<{
    id: 'summary' | 'chat' | 'quiz' | 'projects';
    label: string;
    icon: LucideIcon;
    isDisabled: boolean;
    title?: string;
  }> = [
    { id: 'summary', label: 'Summary', icon: FileText, isDisabled: !hasDocument },
    { id: 'chat', label: 'Ask AI', icon: MessageSquare, isDisabled: !hasDocument || isProcessing },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle, isDisabled: !hasDocument || isProcessing },
    {
      id: 'projects',
      label: 'Projects Studio',
      icon: Cpu,
      isDisabled: !effectiveWorkspaceId,
      title: effectiveWorkspaceId ? undefined : 'Upload or start Reason With Me to unlock',
    },
  ];

  const handleBuildProject = (topic: string) => {
    setSelectedLibraryProject(null);
    setPendingProjectTopic(topic);
    setActiveTab('projects');
  };

  const handleAppendToNotepad = useCallback((text: string) => {
    setAppendNoteText(text);
    setIsNotepadOpen(true);
  }, []);

  const ensureWorkspaceId = async (): Promise<string | null> => {
    if (effectiveWorkspaceId) return effectiveWorkspaceId;
    try {
      const res = await fetch('/api/workspaces', { method: 'POST' });
      const data = await res.json();
      if (res.ok && typeof data.workspaceId === 'string') {
        const wsId = data.workspaceId as string;
        setWorkspaceId(wsId);
        workspaceStore.write({ workspaceId: wsId, fileName: 'Ideation Workspace' });
        return wsId;
      }
    } catch (err) {
      console.error('Failed to bootstrap workspace:', err);
    }
    return null;
  };

  const handleLaunchFromReason = async (topic: string) => {
    const wsId = await ensureWorkspaceId();
    if (wsId) {
      setSelectedLibraryProject(null);
      setPendingProjectTopic(topic);
      setActiveTab('projects');
      setIsSidebarOpen(false);
    }
  };

  const handleSelectProjectFromLibrary = (proj: Project) => {
    setWorkspaceId(proj.workspaceId);
    setSelectedLibraryProject(proj);
    setPendingProjectTopic(null);
    setActiveTab('projects');
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get('project');
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`/api/projects?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.project) throw new Error(data.error || 'Could not open this project.');
        setWorkspaceId(data.project.workspaceId);
        setSelectedLibraryProject(data.project);
        setActiveTab('projects');
        setIsSidebarOpen(false);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not open this project.');
      });
    return () => controller.abort();
  }, []);

  const handleNewBlueprintFromLibrary = () => {
    setSelectedLibraryProject(null);
    setPendingProjectTopic(null);
    setActiveTab('projects');
    setIsSidebarOpen(false);
  };

  const ensureProcessedDocument = async (selectedFile: File): Promise<string | null> => {
    try {
      const workspaceResponse = await fetch('/api/workspaces', { method: 'POST' });
      const workspaceData = await workspaceResponse.json();

      if (!workspaceResponse.ok || typeof workspaceData.workspaceId !== 'string') {
        console.error('Workspace creation failed:', workspaceData.error);
        return null;
      }

      const wsId = workspaceData.workspaceId as string;

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('workspaceId', wsId);

      const response = await fetch('/api/documents/process', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        console.error('Document processing failed:', data.error);
        return null;
      }

      return wsId;
    } catch (err: unknown) {
      console.error('Document processing failed:', err);
      return null;
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    const generation = ++sessionGeneration.current;
    workspaceStore.clear();
    setRawText(null);
    setFile(selectedFile);
    setIsProcessing(true);
    setIsIndexingRag(true);
    setError(null);
    setRagError(false);
    setAnalysis(null);
    setWorkspaceId(null);
    setActiveTab('summary');

    ensureProcessedDocument(selectedFile)
      .then((wsId) => {
        if (sessionGeneration.current !== generation) return;
        if (wsId) {
          setWorkspaceId(wsId);
          workspaceStore.write({ workspaceId: wsId, fileName: selectedFile.name });
        } else {
          setRagError(true);
        }
      })
      .catch((err) => {
        if (sessionGeneration.current !== generation) return;
        console.error('Background RAG indexing failed:', err);
        setRagError(true);
      })
      .finally(() => {
        if (sessionGeneration.current === generation) setIsIndexingRag(false);
      });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const analysisRes = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await analysisRes.json();

      if (!analysisRes.ok) {
        throw new Error(data.error || 'Failed to analyze document');
      }

      if (sessionGeneration.current !== generation) return;
      setAnalysis(data.data);
      setRawText(data.rawText);
      workspaceStore.write({ fileName: selectedFile.name, analysis: data.data, rawText: data.rawText });
      setIsSidebarOpen(false);
    } catch (err: unknown) {
      if (sessionGeneration.current !== generation) return;
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMsg);
      setAnalysis(null);
      setRawText(null);
    } finally {
      if (sessionGeneration.current === generation) setIsProcessing(false);
    }
  };

  const handleRetryRag = async () => {
    if (!file) return;
    const generation = sessionGeneration.current;
    setRagError(false);
    setIsIndexingRag(true);
    try {
      const wsId = await ensureProcessedDocument(file);
      if (sessionGeneration.current !== generation) return;
      if (wsId) {
        setWorkspaceId(wsId);
        workspaceStore.write({ workspaceId: wsId, fileName: file.name });
      } else {
        setRagError(true);
      }
    } finally {
      if (sessionGeneration.current === generation) setIsIndexingRag(false);
    }
  };

  const handleConfirmReset = ({ clearNotepad }: { clearNotepad: boolean }) => {
    sessionGeneration.current++;
    setIsProcessing(false);
    setFile(null);
    setAnalysis(null);
    setRawText(null);
    setError(null);
    setRagError(false);
    setIsIndexingRag(false);
    setWorkspaceId(null);
    setPendingProjectTopic(null);
    setSelectedLibraryProject(null);
    workspaceStore.clear();
    setIsSidebarOpen(true);
    setActiveTab('summary');

    if (clearNotepad) {
      try {
        localStorage.removeItem('learnmate_lab_notepad');
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="relative flex h-screen w-full bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Mobile backdrop overlay when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* DOCUMENT & IDEATION SIDEBAR (collapsible / responsive) */}
      {isSidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-30 flex w-[85vw] max-w-sm md:w-80 lg:w-96 shrink-0 flex-col border-r border-gray-200 bg-white shadow-xl md:relative md:shadow-none">
          <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <BookOpen className="text-blue-600 h-6 w-6" />
              <h2 className="text-lg font-bold tracking-tight">LearnMate</h2>
            </div>
            {/* Close button — always visible for easy dismissal */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </header>

          <main className="flex-1 px-5 py-5 flex flex-col justify-start overflow-y-auto space-y-5">
            {!hasDocument ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Option 1 — Study a Document
                  </span>
                  <FileUpload onFileSelect={handleFileSelect} />
                </div>

                <div className="relative flex items-center justify-center">
                  <div className="border-t border-gray-200 w-full" />
                  <span className="absolute bg-white px-3 text-xs font-semibold text-gray-400 uppercase">
                    or
                  </span>
                </div>

                {/* Option 2: Reason With Me Pitch Card */}
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-purple-50/50 to-blue-50 p-5 space-y-3 shadow-sm">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                    <Sparkles className="h-5 w-5 text-indigo-600 shrink-0" />
                    <span>Reason With Me</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Have an idea for a machine, robot, circuit, or CAD mechanism? Speak or type it — we&apos;ll evaluate feasibility, write FreeCAD/AutoCAD code, and generate a 2D interactive blueprint.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsReasonModalOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-indigo-700 transition active:scale-[.98]"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Speak or Pitch an Idea</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full bg-gray-50 rounded-2xl border border-gray-200 p-5 flex items-center justify-center flex-col relative overflow-hidden shadow-sm space-y-3">
                <FileText
                  className={`h-12 w-12 ${
                    isProcessing
                      ? 'text-blue-400 animate-pulse'
                      : error
                      ? 'text-red-500'
                      : 'text-blue-600'
                  }`}
                />

                <p className="text-gray-900 font-semibold text-sm text-center truncate w-full px-2">
                  {headerDocumentName}
                </p>

                {isProcessing ? (
                  <div className="flex items-center space-x-2 text-blue-600 font-medium text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing document…</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-200">
                      Analysis Failed
                    </p>
                    <button
                      disabled={!file}
                      onClick={() => file && handleFileSelect(file)}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1.5 font-medium"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Analysis
                    </button>
                  </div>
                ) : effectiveAnalysis ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm text-green-700 font-medium bg-green-50 px-3 py-1 rounded-full border border-green-200">
                      ✓ Analysis Complete
                    </p>
                    {isIndexingRag ? (
                      <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 animate-pulse font-medium">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Indexing Studio Graph…</span>
                      </div>
                    ) : ragError && file ? (
                      <button
                        onClick={handleRetryRag}
                        className="text-sm text-amber-600 hover:underline flex items-center gap-1.5 font-medium"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry RAG Indexing
                      </button>
                    ) : workspaceId ? (
                      <span className="text-xs text-gray-500 font-medium">
                        ✓ Studio Graph Ready
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2.5 w-full pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsReasonModalOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Reason With Me</span>
                  </button>

                  <button
                    onClick={() => setIsResetModalOpen(true)}
                    className="text-sm text-gray-400 hover:text-red-500 font-medium transition py-1.5 text-center"
                  >
                    Remove Document / Reset
                  </button>
                </div>
              </div>
            )}
          </main>
        </aside>
      )}

      {/* MAIN VIEWPORT — Expands fully when sidebar is hidden */}
      <div className="flex min-w-0 flex-1 flex-col bg-gray-50 overflow-hidden">
        {/* Navigation & Action Header — generous height, easy tap targets */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-4 py-2.5 shrink-0 gap-2">
          <div className="flex items-center gap-2 shrink-0">
            {/* Sidebar Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((open) => !open)}
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </button>

            {!isSidebarOpen && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-600 hidden sm:block">LearnMate</span>
                {headerDocumentName && (
                  <span className="hidden md:inline-block truncate max-w-[200px] rounded-full border border-gray-200 bg-gray-50 px-3 py-0.5 text-xs text-gray-600 font-medium">
                    {headerDocumentName}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Center Tabs — larger tap targets, label always visible on sm+ */}
          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto flex-1 justify-center mx-2 sm:mx-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.isDisabled}
                title={tab.title}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap ${
                  displayTab === tab.id
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40'
                }`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="hidden xs:inline sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Right Action Utilities */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Project Library Button */}
            <button
              type="button"
              onClick={() => setIsLibraryModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition shadow-sm"
              title="Open Project Library Manager"
            >
              <FolderOpen className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="hidden md:inline">Library</span>
            </button>

            {/* Reason With Me Button */}
            <button
              type="button"
              onClick={() => setIsReasonModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 sm:px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
              title="Reason With Me (Voice/Text Ideation)"
            >
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="hidden lg:inline">Reason With Me</span>
            </button>

            {/* Notepad Button */}
            <button
              type="button"
              onClick={() => setIsNotepadOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition shadow-sm"
              title="Open Laboratory Notepad"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden xl:inline">Notepad</span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition shadow-sm"
              title="AI Settings: Connect Custom Key or Local Ollama"
            >
              <Settings className="h-4 w-4" />
            </button>

            {/* Reset Session Button */}
            {(hasDocument || effectiveWorkspaceId) && (
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="flex items-center rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                title="Reset / Delete Previous Learning"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Tab Content Display Area */}
        <div className="flex-1 min-h-0 p-2 sm:p-4 overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center p-4">
              <div className="bg-red-50 border border-red-200 p-8 rounded-2xl flex flex-col items-center text-center max-w-sm w-full">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h3 className="font-bold text-red-800 text-base mb-2">Analysis Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : !hasDocument && !effectiveWorkspaceId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-6 sm:p-10 space-y-5">
              <Sparkles className="h-14 w-14 text-indigo-400 opacity-60 animate-bounce" />
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-700">Welcome to LearnMate Studio</h3>
                <p className="text-sm text-gray-500 max-w-md leading-relaxed">
                  Upload a lecture or textbook document on the left, click{' '}
                  <strong>Reason With Me</strong> to explore an idea without a document, or browse your{' '}
                  <strong>Project Library</strong>.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReasonModalOpen(true)}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Start with Reason With Me</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLibraryModalOpen(true)}
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition flex items-center gap-2"
                >
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                  <span>Open Library</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`h-full bg-white border border-gray-200 rounded-xl shadow-sm ${
                displayTab === 'projects'
                  ? 'p-1 sm:p-2 overflow-hidden flex flex-col'
                  : 'mx-auto w-full max-w-5xl p-4 sm:p-8 overflow-y-auto'
              }`}
            >
              <div className={displayTab === 'summary' ? 'block' : 'hidden'}>
                <SummaryTab
                  analysis={effectiveAnalysis}
                  isProcessing={isProcessing}
                  onBuildProject={effectiveWorkspaceId ? handleBuildProject : undefined}
                />
              </div>
              <div className={displayTab === 'chat' ? 'block' : 'hidden'}>
                <ChatTab key={headerDocumentName ?? 'none'} rawText={effectiveRawText} workspaceId={effectiveWorkspaceId} />
              </div>
              <div className={displayTab === 'quiz' ? 'block' : 'hidden'}>
                <QuizTab key={headerDocumentName ?? 'none'} rawText={effectiveRawText} />
              </div>
              <div className={displayTab === 'projects' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
                <ProjectsTab
                  workspaceId={effectiveWorkspaceId}
                  initialTopic={pendingProjectTopic}
                  onTopicConsumed={() => setPendingProjectTopic(null)}
                  onSendToNotepad={handleAppendToNotepad}
                  selectedProject={selectedLibraryProject}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PROJECT & LAB LIBRARY MODAL */}
      <ProjectLibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        workspaceId={effectiveWorkspaceId}
        onSelectProject={handleSelectProjectFromLibrary}
        onNewBlueprint={handleNewBlueprintFromLibrary}
      />

      {/* SETTINGS MODAL (Bring-Your-Own-Key / Local Ollama) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* REASON WITH ME MODAL */}
      <ReasonWithMeModal
        isOpen={isReasonModalOpen}
        onClose={() => setIsReasonModalOpen(false)}
        onLaunchBlueprint={handleLaunchFromReason}
        onSendToNotepad={handleAppendToNotepad}
      />

      {/* RESET / DELETE SESSION MODAL */}
      <ResetConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirmReset={handleConfirmReset}
        activeFileName={headerDocumentName}
      />

      {/* PERSISTENT LABORATORY NOTEPAD DRAWER */}
      <NotepadDrawer
        isOpen={isNotepadOpen}
        onClose={() => setIsNotepadOpen(false)}
        appendNoteText={appendNoteText}
        onClearAppendNote={() => setAppendNoteText(null)}
      />
    </div>
  );
}
