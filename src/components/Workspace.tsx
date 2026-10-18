'use client';

// Main dashboard shell that owns the uploaded document state and coordinates the learning tabs.
// Layout: a collapsible left document sidebar plus a main content area that
// expands to the full screen width whenever the sidebar is hidden.
import { useSyncExternalStore, useState } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import SummaryTab from '@/components/SummaryTab';
import ChatTab from '@/components/ChatTab';
import QuizTab from '@/components/QuizTab';
import ProjectsTab from '@/components/ProjectsTab';
import { DocumentAnalysis } from '@/types';

/** localStorage key holding the last active workspace across page reloads. */
const ACTIVE_WORKSPACE_KEY = 'learnmate_active_workspace';

interface SavedWorkspace {
  workspaceId: string;
  fileName: string | null;
  savedAt: string | null;
}

/**
 * External store wrapper around the saved-workspace entry. React restores it
 * through useSyncExternalStore: reads are hydration-safe (the server snapshot
 * is null), and writes/clears notify subscribers to re-render.
 */
const workspaceStore = (() => {
  // `undefined` marks "not read yet" so getSnapshot stays referentially
  // stable between unrelated renders, as React's snapshot contract requires.
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
      // Corrupted or inaccessible storage: treat as no saved workspace.
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
        // Persistence is best-effort; the session still works in memory.
      }
      snapshot = read();
      notify();
    },
    clear(): void {
      try {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      } catch {
        // Storage unavailable; reset the snapshot below regardless.
      }
      snapshot = null;
      notify();
    },
  };
})();

export default function Workspace() {
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'quiz' | 'projects'>('summary');

  // Document sidebar visibility. Open by default (upload stage is half the
  // screen); it auto-collapses as soon as a document finishes analyzing so
  // the learning tabs take over the whole viewport.
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

  // External-store snapshot of the workspace saved by a previous page load.
  // Restoring goes through useSyncExternalStore: hydration-safe (the server
  // snapshot is null) and rule-compliant with no setState-in-effect.
  const savedWorkspace = useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getServerSnapshot,
  );

  // A restored studio (after a refresh) reattaches through the saved id even
  // though the document bytes themselves are not persisted: the Projects
  // canvas comes back fully unlocked, while reading/quiz tabs stay locked
  // until the file is uploaded again in this browser session.
  const effectiveWorkspaceId = workspaceId ?? savedWorkspace?.workspaceId ?? null;

  // A restored session has only Projects unlocked, so that is also the tab
  // displayed by default; with a real file loaded, activeTab rules as usual.
  const displayTab =
    activeTab === 'summary' && !file && effectiveWorkspaceId ? 'projects' : activeTab;

  // Name shown in the header chip: the live file, else the restored one.
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
      label: 'Projects',
      icon: Cpu,
      isDisabled: !effectiveWorkspaceId,
      title: effectiveWorkspaceId ? undefined : 'Waiting for document processing...',
    },
  ];

  // Called from SummaryTab when a learner clicks "Build a Project" on a concept
  const handleBuildProject = (topic: string) => {
    setPendingProjectTopic(topic);
    setActiveTab('projects');
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

      // Persist the freshly created workspace so a page refresh restores it.
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

    // Trigger vector RAG embedding concurrently in the background
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

    // Execute document analysis immediately so student sees summary fast
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

      // Analysis succeeded: get out of the way and let the summary take the
      // full screen. On failure the sidebar stays open so file status and the
      // retry action remain visible without an extra click.
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

  const handleRemoveDocument = () => {
    setFile(null);
    setAnalysis(null);
    setRawText(null);
    setError(null);
    setRagError(false);
    setIsIndexingRag(false);
    workspaceStore.clear();
    // Back to the upload stage: bring the sidebar back so the drop zone is visible.
    setIsSidebarOpen(true);
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900 font-sans">
      {/* DOCUMENT SIDEBAR (collapsible) */}
      {isSidebarOpen && (
        <aside className="flex w-1/2 shrink-0 flex-col border-r border-gray-200 bg-white">
          <header className="p-4 border-b border-gray-200 flex items-center space-x-2">
            <BookOpen className="text-blue-600 h-6 w-6" />
            <h2 className="text-xl font-bold tracking-tight">LearnMate</h2>
            {file && (
              <span className="ml-auto truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 max-w-[260px]">
                {file.name}
              </span>
            )}
          </header>

          <main className="flex-1 p-8 flex flex-col items-center justify-center relative overflow-y-auto">
            {!file ? (
              <FileUpload onFileSelect={handleFileSelect} />
            ) : (
              <div className="w-full max-w-md bg-gray-50 rounded-xl border-2 border-gray-200 p-8 flex items-center justify-center flex-col relative overflow-hidden shadow-sm">
                <FileText
                  className={`h-16 w-16 mb-4 ${
                    isProcessing
                      ? 'text-blue-400 animate-pulse'
                      : error
                      ? 'text-red-500'
                      : 'text-blue-600'
                  }`}
                />

                <p className="text-gray-900 font-semibold text-lg text-center truncate w-full px-4">
                  {file.name}
                </p>

                {isProcessing ? (
                  <div className="mt-4 flex items-center space-x-2 text-blue-600 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing document...</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center">
                    <p className="text-sm text-red-600 mt-2 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-200">
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
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <p className="text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full border border-green-200">
                      Analysis Complete
                    </p>
                    {isIndexingRag ? (
                      <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 animate-pulse font-medium">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Indexing System Studio Graph...</span>
                      </div>
                    ) : ragError ? (
                      <button
                        onClick={handleRetryRag}
                        className="text-xs text-amber-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry Projects RAG Indexing
                      </button>
                    ) : workspaceId ? (
                      <span className="text-[11px] text-gray-500 font-medium">
                        ✓ System Studio Ready
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <button
                  onClick={handleRemoveDocument}
                  disabled={isProcessing}
                  suppressHydrationWarning
                  className="mt-8 text-sm text-gray-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
                >
                  Remove Document
                </button>
              </div>
            )}
          </main>
        </aside>
      )}

      {/* MAIN CONTENT — expands to full width when the sidebar is hidden */}
      <div className="flex min-w-0 flex-1 flex-col bg-gray-50">
        <header className="relative flex items-stretch border-b border-gray-200 bg-white px-3 pt-3">
          {/* Sidebar toggle: collapse to full screen / expand to view file status */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen((open) => !open)}
            suppressHydrationWarning
            title={isSidebarOpen ? 'Hide document panel' : 'Show document panel'}
            className="self-center flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>

          {/* When the sidebar is hidden, keep the brand and the active file visible */}
          {!isSidebarOpen && (
            <div className="min-w-0 self-center flex items-center gap-1.5 pl-0.5">
              <span className="text-[13px] font-bold tracking-tight text-blue-600">LearnMate</span>
              {headerDocumentName && (
                <span className="truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600 ml-1 max-w-[240px]">
                  {headerDocumentName}
                </span>
              )}
            </div>
          )}

          <nav className="flex min-w-0 flex-1 items-stretch justify-center gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.isDisabled}
                suppressHydrationWarning
                title={tab.title}
                className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${
                  displayTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 min-h-0 p-4 md:p-6 overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 p-6 rounded-xl flex flex-col items-center text-center max-w-sm">
                <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                <h3 className="font-semibold text-red-800 mb-1">Analysis Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : !file && !effectiveWorkspaceId ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Upload a document to unlock learning tools.</p>
            </div>
          ) : (
            <div
              className={`h-full bg-white border border-gray-200 rounded-xl shadow-sm ${
                displayTab === 'projects'
                  ? 'p-3 overflow-hidden flex flex-col'
                  : 'mx-auto w-full max-w-6xl p-6 overflow-y-auto'
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
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}