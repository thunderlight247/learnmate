'use client';

// Settings Modal: Bring-Your-Own-Key & Local Ollama Configuration
// Allows learners to connect their own API key (Groq, OpenAI, OpenRouter) or
// run 100% offline using Local Ollama for zero-latency, rate-limit-free generations.

import { useState } from 'react';
import {
  Settings,
  X,
  Check,
  Loader2,
  Server,
  Zap,
  Key,
  Eye,
  EyeOff,
  Cpu,
  AlertCircle,
} from 'lucide-react';
import type { CustomAiConfig } from '@/lib/aiClient';

export const AI_CONFIG_STORAGE_KEY = 'learnmate_custom_ai_config';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: CustomAiConfig) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onConfigSaved,
}: SettingsModalProps) {
  const [provider, setProvider] = useState<CustomAiConfig['provider']>('default');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
    availableModels?: string[];
  } | null>(null);

  // Load the saved config each time the modal opens. This runs during render
  // (not in an effect) and only after the modal opens, so SSR and the first
  // client render both show the defaults.
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      try {
        const saved = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as CustomAiConfig;
          setProvider(parsed.provider || 'default');
          setApiKey(parsed.apiKey || '');
          setBaseUrl(parsed.baseUrl || 'http://localhost:11434');
          setModel(parsed.model || '');
        }
      } catch {
        // storage unavailable
      }
    }
  }

  const handleProviderChange = (newProvider: CustomAiConfig['provider']) => {
    setProvider(newProvider);
    setTestResult(null);
    if (newProvider === 'ollama' && !model) {
      setModel('llama3');
    } else if (newProvider === 'groq' && !model) {
      setModel('llama-3.3-70b-versatile');
    } else if (newProvider === 'openai' && !model) {
      setModel('gpt-4o-mini');
    } else if (newProvider === 'openrouter' && !model) {
      setModel('openrouter/auto');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/settings/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          baseUrl,
          model,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Network failure when testing connection.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const config: CustomAiConfig = {
      provider,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      model: model.trim() || undefined,
    };

    try {
      localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // storage failed
    }

    onConfigSaved?.(config);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative flex flex-col w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/90 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">AI Provider &amp; Model Engine</h2>
              <p className="text-xs text-gray-500">
                Connect your personal API key or run 100% offline with Local Ollama
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Provider Selection Cards */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Select AI Engine / Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'default', label: 'Default Shared', desc: 'Free Tier Fallbacks', icon: Cpu },
                { id: 'ollama', label: 'Local Ollama', desc: '100% Offline & Private', icon: Server },
                { id: 'groq', label: 'Groq Cloud', desc: 'Ultra-Fast Llama 3.3', icon: Zap },
                { id: 'openai', label: 'OpenAI', desc: 'GPT-4o & GPT-4o-mini', icon: Key },
                { id: 'openrouter', label: 'OpenRouter', desc: 'Personal API Key', icon: Key },
              ].map((p) => {
                const Icon = p.icon;
                const isSelected = provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id as CustomAiConfig['provider'])}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-gray-500'}`} />
                      <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950' : 'text-gray-800'}`}>
                        {p.label}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Inputs */}
          {provider === 'ollama' && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 text-xs font-bold uppercase">
                <Server className="h-4 w-4 text-indigo-600" />
                <span>Local Ollama Configuration</span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Ollama Server URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    Must allow origins or run locally (e.g. OLLAMA_ORIGINS=&quot;*&quot; ollama serve)
                  </span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Model Tag
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama3, mistral, deepseek-r1:8b, qwen2.5:7b"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {(provider === 'groq' || provider === 'openai' || provider === 'openrouter') && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-800 text-xs font-bold uppercase">
                <Key className="h-4 w-4 text-blue-600" />
                <span>Personal API Credentials</span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        provider === 'groq'
                          ? 'gsk_...'
                          : provider === 'openai'
                          ? 'sk-...'
                          : 'sk-or-v1-...'
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 pr-8 text-xs font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    Saved only in your browser&apos;s private localStorage.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Model Identifier (Optional)
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={
                      provider === 'groq'
                        ? 'llama-3.3-70b-versatile'
                        : provider === 'openai'
                        ? 'gpt-4o-mini'
                        : 'openrouter/auto'
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test Connection Button & Status */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || (provider !== 'default' && provider !== 'ollama' && !apiKey.trim())}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition shadow-xs disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Testing Connection...</span>
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            {testResult && (
              <div className="text-xs">
                {testResult.success ? (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <Check className="h-3.5 w-3.5" />
                    <span>Verified {testResult.latencyMs ? `(${testResult.latencyMs}ms)` : ''}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Failed: {testResult.error?.slice(0, 45)}...</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <Check className="h-4 w-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
