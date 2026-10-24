'use client';

// User-Controlled Reset / Delete Previous Learning Modal
// Ensures learning sessions are never wiped automatically,
// giving users clear choice to reset their active session, document, or local studio state.

import { useState } from 'react';
import { AlertTriangle, Trash2, X, RefreshCw } from 'lucide-react';

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset: (options: { clearNotepad: boolean }) => void;
  activeFileName?: string | null;
}

export default function ResetConfirmModal({
  isOpen,
  onClose,
  onConfirmReset,
  activeFileName,
}: ResetConfirmModalProps) {
  const [clearNotepad, setClearNotepad] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Reset Learning Session?</h3>
              <p className="text-xs text-gray-500">Your choice — sessions are never wiped automatically</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          {activeFileName ? (
            <>
              This will remove the current document <strong className="text-gray-900">"{activeFileName}"</strong> and reset your active study session back to the clean workspace.
            </>
          ) : (
            'This will reset your current learning canvas and study session back to the clean workspace.'
          )}
        </p>

        <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-700 cursor-pointer hover:bg-gray-100/80 transition">
          <input
            type="checkbox"
            checked={clearNotepad}
            onChange={(e) => setClearNotepad(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span>Also clear Laboratory Notepad scratchpad</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmReset({ clearNotepad });
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Reset Learning Session</span>
          </button>
        </div>
      </div>
    </div>
  );
}
