'use client';

// Main dashboard shell that owns the uploaded document state and coordinates the three learning tabs.
import { useState } from 'react';
import { BookOpen, MessageSquare, HelpCircle, FileText, Loader2, AlertCircle } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import SummaryTab from '@/components/SummaryTab';
import ChatTab from '@/components/ChatTab';
import QuizTab from '@/components/QuizTab';
import { DocumentAnalysis } from '@/types';

export default function Workspace() {
  const [activeTab, setActiveTab] = useState<'summary' | 'chat' | 'quiz'>('summary');
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsProcessing(true);
    setError(null);
    setAnalysis(null);
    setActiveTab('summary');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze document');
      }

      setAnalysis(data.data);
      setRawText(data.rawText);
      
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveDocument = () => {
    setFile(null);
    setAnalysis(null);
    setRawText(null);
    setError(null);
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900 font-sans">
      
      {/* LEFT PANE */}
      <div className="w-1/2 border-r border-gray-200 bg-white flex flex-col">
        <header className="p-4 border-b border-gray-200 flex items-center space-x-2">
          <BookOpen className="text-blue-600 h-6 w-6"/>
          <h2 className="text-xl font-bold tracking-tight">LearnMate</h2>
        </header>
        
        <main className="flex-1 p-8 flex flex-col items-center justify-center relative">
          {!file ? (
            <FileUpload onFileSelect={handleFileSelect} />
          ) : (
            <div className="w-full max-w-md bg-gray-50 rounded-xl border-2 border-gray-200 p-8 flex items-center justify-center flex-col relative overflow-hidden shadow-sm">
              <FileText
                className={`h-16 w-16 mb-4 ${isProcessing ? 'text-blue-400 animate-pulse' : 'text-blue-600'}`}
              />

              <p className="text-gray-900 font-semibold text-lg text-center truncate w-full px-4">
                {file.name}
              </p>

              {isProcessing ? (
                <div className="mt-4 flex items-center space-x-2 text-blue-600 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing document...</span>
                </div>
              ) : (
                <p className="text-sm text-green-600 mt-2 font-medium bg-green-50 px-3 py-1 rounded-full border border-green-200">
                  Analysis Complete
                </p>
              )}

              <button
                onClick={handleRemoveDocument}
                disabled={isProcessing}
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
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${activeTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            <FileText className="h-4 w-4"/>
            <span>Summary</span>
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            disabled={!file || isProcessing}
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${activeTab === 'chat' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            <MessageSquare className="h-4 w-4"/>
            <span>Ask AI</span>
          </button>
          <button 
            onClick={() => setActiveTab('quiz')}
            disabled={!file || isProcessing}
            className={`pb-3 px-2 font-medium flex items-center space-x-2 border-b-2 transition-colors disabled:opacity-50 ${activeTab === 'quiz' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            <HelpCircle className="h-4 w-4"/>
            <span>Quiz</span>
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <div className="bg-red-50 border border-red-200 p-6 rounded-xl flex flex-col items-center text-center max-w-sm">
                <AlertCircle className="h-10 w-10 text-red-500 mb-3"/>
                <h3 className="font-semibold text-red-800 mb-1">Analysis Failed</h3>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : !file ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Upload a document to unlock learning tools.</p>
            </div>
          ) : (
            <div className="h-full bg-white border border-gray-200 rounded-xl p-6 shadow-sm overflow-y-auto">
              {activeTab === 'summary' && <SummaryTab analysis={analysis} isProcessing={isProcessing} />}
              {activeTab === 'chat' && <ChatTab rawText={rawText} />}
              {activeTab === 'quiz' && <QuizTab rawText={rawText} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}