'use client';

// Main dashboard shell that owns the uploaded document state, "Reason With Me" ideation,
// and coordinates the learning tabs with adaptive responsive layouts.
import { useSyncExternalStore, useState, useCallback } from 'react';
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
  Maximize2,
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
import { DocumentAnalysis } from '@/types';

/** localStorage key holding the last active workspace across page reloads. */
const ACTIVE_WORKSPACE_KEY = 'learnmate_active_workspace';

interface SavedWorkspace {
  workspaceId: string;
  fileName: string | null;
  savedAt: string | null;
}

/**
 * External store wrapper around the saved-workspace entry.
 */
const workspaceStore = (() => {
  let snapshot: SavedWorkspace | null | undefined;
  const listeners = new Set<() => void>();

  const read = (): SavedWorkspace | null => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      if (!saved) return null;

      const parsed = JSON.parse(saved) as Partial<SavedWorkspace> | null;
      const wsId = typeof parsed?.workspaceId === 'string' ? parsed.workspaceId.trim() : '';
      if (!wsId) {
        if (saved.trim()) {
          window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        }
        return null;
      }
      return {
        workspaceId: wsId,
        fileName: typeof parsed?.fileName === 'string' ? parsed.fileName : null,
        savedAt: typeof parsed?.savedAt === 'string' ? parsed.savedAt : null,
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
    write(entry: { workspaceId: string; fileName: string | null }): void {
      try {
        window.localStorage.setItem(
          ACTIVE_WORKSPACE_KEY,
          JSON.stringify({
            workspaceId: entry.workspaceId,
            fileName: entry.fileName,
            savedAt: new Date().toISOString(),
          }),
        );
      } catch {
        // best-effort
      }
      snapshot = read();
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [ragError, setRagError] = useState<boolean>(false);
  const [isIndexingRag, setIsIndexingRag] = useState<boolean>(false);
  const [pendingProjectTopic, setPendingProjectTopic] = useState<string | null>(null);

  // Modals & Drawers
  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [appendNoteText, setAppendNoteText] = useState<string | null>(null);

  const savedWorkspace = useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getServerSnapshot,
  );

  const effectiveWorkspaceId = workspaceId ?? savedWorkspace?.workspaceId ?? null;

  const displayTab =
    activeTab === 'summary' && !file && effectiveWorkspaceId ? 'projects' : activeTab;

  const headerDocumentName = file?.name ?? savedWorkspace?.fileName ?? null;

  const tabs: Array<{
    id: 'summary' | 'chat' | 'quiz' | 'projects';
    label: string;
    icon: LucideIcon;
    isDisabled: boolean;
    title?: string;
  }> = [
    { id: 'summary', label: 'Summary', icon: FileText, isDisabled: !file },
    { id: 'chat', label: 'Ask AI', icon: MessageSquare, isDisabled: !file || isProcessing },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle, isDisabled: !file || isProcessing },
    {
      id: 'projects',
      label: 'Projects Studio',
      icon: Cpu,
      isDisabled: !effectiveWorkspaceId,
      title: effectiveWorkspaceId ? undefined : 'Upload or start Reason With Me to unlock',
    },
  ];

  const handleBuildProject = (topic: string) => {
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
      setPendingProjectTopic(topic);
      setActiveTab('projects');
      setIsSidebarOpen(false); // Give the canvas maximum room
    }
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

      workspaceStore.write({ workspaceId: wsId, fileName: selectedFile.name });
      return wsId;
    } catch (err: unknown) {
      console.error('Document processing failed:', err);
      return null;
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
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
        if (wsId) {
          setWorkspaceId(wsId);
        } else {
          setRagError(true);
        }
      })
      .catch((err) => {
        console.error('Background RAG indexing failed:', err);
        setRagError(true);
      })
      .finally(() => {
        setIsIndexingRag(false);
      });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const analysisRes = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await analysisRes.json();

      if (!analysisRes.ok) {
        throw new Error(data.error || 'Failed to analyze document');
      }

      setAnalysis(data.data);
      setRawText(data.rawText);
      setIsSidebarOpen(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMsg);
      setAnalysis(null);
      setRawText(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryRag = async () => {
    if (!file) return;
    setRagError(false);
    setIsIndexingRag(true);
    try {
      const wsId = await ensureProcessedDocument(file);
      if (wsId) {
        setWorkspaceId(wsId);
      } else {
        setRagError(true);
      }
    } finally {
      setIsIndexingRag(false);
    }
  };

  const handleConfirmReset = ({ clearNotepad }: { clearNotepad: boolean }) => {
    setFile(null);
    setAnalysis(null);
    setRawText(null);
    setError(null);
    setRagError(false);
    setIsIndexingRag(false);
    setWorkspaceId(null);
    setPendingProjectTopic(null);
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
      {/* DOCUMENT & IDEATION SIDEBAR (collapsible / responsive) */}
      {isSidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-30 flex w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-gray-200 bg-white shadow-lg md:relative md:shadow-none transition-all">
          <header className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookOpen className="text-blue-600 h-6 w-6" />
              <h2 className="text-xl font-bold tracking-tight">LearnMate</h2>
            </div>
            {/* Close button on mobile */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden rounded p-1 text-gray-500 hover:bg-gray-100"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </header>

          <main className="flex-1 p-5 flex flex-col justify-start relative overflow-y-auto space-y-4">
            {!file ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Option 1: Study Document
                  </span>
                  <FileUpload onFileSelect={handleFileSelect} />
                </div>

                <div className="relative flex items-center justify-center py-2">
                  <div className="border-t border-gray-200 w-full" />
                  <span className="bg-white px-2 text-[11px] font-semibold text-gray-400 uppercase">
                    Or Ideate Directly
                  </span>
                </div>

                {/* Option 2: Reason With Me Pitch Card */}
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-blue-50/60 p-4 space-y-2.5 shadow-sm">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wide">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span>Reason With Me</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">
                    Have an idea for a machine, robot, circuit, or CAD mechanism? Speak or type it — we will evaluate feasibility, write FreeCAD/AutoCAD code, and generate a 2D interactive blueprint.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsReasonModalOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    <span>Speak or Pitch an Idea</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full bg-gray-50 rounded-xl border border-gray-200 p-5 flex items-center justify-center flex-col relative overflow-hidden shadow-sm">
                <FileText
                  className={`h-12 w-12 mb-3 ${
                    isProcessing
                      ? 'text-blue-400 animate-pulse'
                      : error
                      ? 'text-red-500'
                      : 'text-blue-600'
                  }`}
                />

                <p className="text-gray-900 font-semibold text-sm text-center truncate w-full px-2">
                  {file.name}
                </p>

                {isProcessing ? (
                  <div className="mt-3 flex items-center space-x-2 text-blue-600 font-medium text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing document...</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center mt-2">
                    <p className="text-xs text-red-600 font-medium bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                      Analysis Failed
                    </p>
                    <button
                      onClick={() => file && handleFileSelect(file)}
                      className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry Analysis
                    </button>
                  </div>
                ) : analysis ? (
                  <div className="flex flex-col items-center gap-1.5 mt-2">
                    <p className="text-xs text-green-700 font-medium bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                      ✓ Analysis Complete
                    </p>
                    {isIndexingRag ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100 animate-pulse font-medium">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Indexing Studio Graph...</span>
                      </div>
                    ) : ragError ? (
                      <button
                        onClick={handleRetryRag}
                        className="text-xs text-amber-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry RAG Indexing
                      </button>
                    ) : workspaceId ? (
                      <span className="text-[11px] text-gray-500 font-medium">
                        ✓ Studio Graph Ready
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-col gap-2 w-full pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsReasonModalOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Reason With Me</span>
                  </button>

                  <button
                    onClick={() => setIsResetModalOpen(true)}
                    disabled={isProcessing}
                    className="text-xs text-gray-500 hover:text-red-600 font-medium transition py-1"
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
        {/* Navigation & Action Header */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            {/* Sidebar Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((open) => !open)}
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition"
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>

            {!isSidebarOpen && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-600">LearnMate</span>
                {headerDocumentName && (
                  <span className="hidden sm:inline-block truncate max-w-[200px] rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-600 font-medium">
                    {headerDocumentName}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 sm:gap-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.isDisabled}
                title={tab.title}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  displayTab === tab.id
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Right Action Utilities: Reason With Me, Notepad, Reset */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsReasonModalOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
              title="Reason With Me (Voice/Text Ideation)"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              <span className="hidden md:inline">Reason With Me</span>
            </button>

            <button
              type="button"
              onClick={() => setIsNotepadOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition shadow-sm"
              title="Open Laboratory Notepad"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Notepad</span>
            </button>

            {(file || effectiveWorkspaceId) && (
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="flex items-center rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
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
            <div className="h-full flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 p-6 rounded-xl flex flex-col items-center text-center max-w-sm">
                <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                <h3 className="font-semibold text-red-800 mb-1">Analysis Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : !file && !effectiveWorkspaceId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-6 space-y-3">
              <Sparkles className="h-12 w-12 text-indigo-400 opacity-60 animate-bounce" />
              <h3 className="text-base font-bold text-gray-700">Welcome to LearnMate Studio</h3>
              <p className="text-xs text-gray-500 max-w-md">
                Upload a lecture/textbook document on the left, or click <strong>Reason With Me</strong> to explore an idea without a document.
              </p>
              <button
                type="button"
                onClick={() => setIsReasonModalOpen(true)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                <span>Start with Reason With Me</span>
              </button>
            </div>
          ) : (
            <div
              className={`h-full bg-white border border-gray-200 rounded-xl shadow-sm ${
                displayTab === 'projects'
                  ? 'p-2 overflow-hidden flex flex-col'
                  : 'mx-auto w-full max-w-5xl p-4 sm:p-6 overflow-y-auto'
              }`}
            >
              <div className={displayTab === 'summary' ? 'block' : 'hidden'}>
                <SummaryTab
                  analysis={analysis}
                  isProcessing={isProcessing}
                  onBuildProject={effectiveWorkspaceId ? handleBuildProject : undefined}
                />
              </div>
              <div className={displayTab === 'chat' ? 'block' : 'hidden'}>
                <ChatTab rawText={rawText} />
              </div>
              <div className={displayTab === 'quiz' ? 'block' : 'hidden'}>
                <QuizTab rawText={rawText} />
              </div>
              <div className={displayTab === 'projects' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
                <ProjectsTab
                  workspaceId={effectiveWorkspaceId}
                  initialTopic={pendingProjectTopic}
                  onTopicConsumed={() => setPendingProjectTopic(null)}
                  onSendToNotepad={handleAppendToNotepad}
                />
              </div>
            </div>
          )}
        </div>
      </div>

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
