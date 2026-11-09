'use client';

// Omnipresent Laboratory Notepad & Scratchpad
// Persists notes to localStorage across browser reloads.
// Allows learners to capture equations, CAD snippets, empirical trial tables, and AI insights.

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
  BookOpen,
  X,
  Copy,
  Check,
  Download,
  Trash2,
} from 'lucide-react';

interface NotepadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  appendNoteText?: string | null;
  onClearAppendNote?: () => void;
}

const NOTEPAD_STORAGE_KEY = 'learnmate_lab_notepad';

// Reads localStorage through useSyncExternalStore so the first client render
// matches the server render (empty notes) and the saved notes load afterwards.
const notepadStore = (() => {
  let snapshot: string | undefined;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): string {
      if (snapshot === undefined) {
        try {
          snapshot = localStorage.getItem(NOTEPAD_STORAGE_KEY) ?? '';
        } catch {
          snapshot = '';
        }
      }
      return snapshot;
    },
    getServerSnapshot(): string {
      return '';
    },
    set(value: string) {
      snapshot = value;
      try {
        localStorage.setItem(NOTEPAD_STORAGE_KEY, value);
      } catch {
        // storage quota or private mode
      }
      listeners.forEach((listener) => listener());
    },
  };
})();

export default function NotepadDrawer({
  isOpen,
  onClose,
  appendNoteText,
  onClearAppendNote,
}: NotepadDrawerProps) {
  const notes = useSyncExternalStore(
    notepadStore.subscribe,
    notepadStore.getSnapshot,
    notepadStore.getServerSnapshot,
  );
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Handle incoming appended text from other components
  useEffect(() => {
    if (appendNoteText) {
      const prev = notepadStore.getSnapshot();
      const divider = prev.trim() ? '\n\n---\n\n' : '';
      notepadStore.set(`${prev}${divider}${appendNoteText}`);
      onClearAppendNote?.();
    }
  }, [appendNoteText, onClearAppendNote]);

  const handleChange = (val: string) => {
    notepadStore.set(val);
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(notes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([notes], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LearnMate-Lab-Notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear your laboratory notepad?')) {
      notepadStore.set('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl border-l border-gray-200 transition-transform">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Laboratory Notepad</h3>
            <span className="text-xs text-gray-500">
              {saveStatus === 'saved' ? '✓ Auto-saved' : 'Saving...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy notes"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download as Markdown"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            title="Clear notes"
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition ml-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex flex-1 flex-col p-4 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Markdown notes & CAD snippets</span>
          <span>{notes.length} characters</span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`# Laboratory Notes\n\n- Record your experimental observations\n- Paste FreeCAD / AutoCAD scripts\n- Note governing formulas and parameters`}
          className="flex-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs leading-relaxed text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
        />
      </div>

      {/* Drawer Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 flex items-center justify-between">
        <span>💡 Use &quot;Send to Notepad&quot; anywhere to pin data</span>
        <button
          type="button"
          onClick={onClose}
          className="font-medium text-blue-600 hover:underline"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
}
