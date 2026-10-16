'use client';

// Main dashboard shell that owns the uploaded document state and coordinates the learning tabs.
import { useState } from 'react';
import { BookOpen, MessageSquare, HelpCircle, FileText, Loader2, AlertCircle, Cpu, RefreshCw } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import SummaryTab from '@/components/SummaryTab';
import ChatTab from '@/components/ChatTab';
import QuizTab from '@/components/QuizTab';
import ProjectsTab from '@/components/ProjectsTab';
import { DocumentAnalysis } from '@/types';

export default function Workspace() {
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'quiz' | 'projects'>('summary');

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [ragError, setRagError] = useState<boolean>(false);
  const [isIndexingRag, setIsIndexingRag] = useState<boolean>(false);
  const [pendingProjectTopic, setPendingProjectTopic] = useState<string | null>(null);

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
    setWorkspaceId(null);
    setRagError(false);
    setIsIndexingRag(false);
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900 font-sans">
      {/* LEFT PANE */}
      <div className="w-1/2 border-r border-gray-200 bg-white flex flex-col">
        <header className="p-4 border-b border-gray-200 flex items-center space-x-2">
          <BookOpen className="text-blue-600 h-6 w-6" />
          <h2 className="text-xl font-bold tracking-tight">LearnMate</h2>
        </header>

        <main className="flex-1 p-8 flex flex-col items-center justify-center relative">
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
      </div>

      {/* RIGHT PANE */}
      <div className="w-1/2 flex flex-col bg-gray-50">
        <div className="flex border-b border-gray-200 bg-white px-4 pt-4 space-x-6">
          <button
            onClick={() => setActiveTab('summary')}
            disabled={!file}
            suppressHydrationWarning
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${
              activeTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Summary</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            disabled={!file || isProcessing}
            suppressHydrationWarning
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${
              activeTab === 'chat' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Ask AI</span>
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            disabled={!file || isProcessing}
            suppressHydrationWarning
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${
              activeTab === 'quiz' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <HelpCircle className="h-4 w-4" />
            <span>Quiz</span>
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            disabled={!workspaceId}
            suppressHydrationWarning
            title={workspaceId ? undefined : 'Waiting for document processing...'}
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${
              activeTab === 'projects' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>Projects</span>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 p-6 rounded-xl flex flex-col items-center text-center max-w-sm">
                <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
                <h3 className="font-semibold text-red-800 mb-1">Analysis Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : !file ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Upload a document to unlock learning tools.</p>
            </div>
          ) : (
            <div
              className={`h-full bg-white border border-gray-200 rounded-xl shadow-sm ${
                activeTab === 'projects' ? 'p-3 overflow-hidden flex flex-col' : 'p-6 overflow-y-auto'
              }`}
            >
              <div className={activeTab === 'summary' ? 'block' : 'hidden'}>
                <SummaryTab
                  analysis={analysis}
                  isProcessing={isProcessing}
                  onBuildProject={workspaceId ? handleBuildProject : undefined}
                />
              </div>
              <div className={activeTab === 'chat' ? 'block' : 'hidden'}>
                <ChatTab rawText={rawText} />
              </div>
              <div className={activeTab === 'quiz' ? 'block' : 'hidden'}>
                <QuizTab rawText={rawText} />
              </div>
              <div className={activeTab === 'projects' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
                <ProjectsTab
                  workspaceId={workspaceId}
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