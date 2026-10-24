'use client';

// "Reason With Me" Modal Component:
// Allows learners to speak (via Web Speech API) or type an engineering concept.
// Evaluates feasibility with scientific honesty, highlights constraints without discouraging,
// outlines a 4-phase roadmap (including FreeCAD / AutoCAD instructions),
// and allows instant one-click blueprint launch into System Studio.

import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  BookOpen,
  Cpu,
  Info,
  Scale,
  Wrench,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ReasonWithMeResponse } from '@/app/api/reason/route';

interface ReasonWithMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchBlueprint: (topic: string) => void;
  onSendToNotepad?: (content: string) => void;
}

export default function ReasonWithMeModal({
  isOpen,
  onClose,
  onLaunchBlueprint,
  onSendToNotepad,
}: ReasonWithMeModalProps) {
  const [ideaText, setIdeaText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ReasonWithMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSpeakingVerdict, setIsSpeakingVerdict] = useState(false);

  const recognitionRef = useRef<any>(null);

  const toggleSpeakVerdict = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !analysis) return;
    if (isSpeakingVerdict) {
      window.speechSynthesis.cancel();
      setIsSpeakingVerdict(false);
    } else {
      window.speechSynthesis.cancel();
      const text = `${analysis.ideaTitle}. Feasibility Verdict: ${analysis.feasibilityVerdict}. ${analysis.scientificRealityCheck.honestVerdictExplanation} Constructive Pathway: ${analysis.constructiveEngineeringPivot}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsSpeakingVerdict(false);
      utterance.onerror = () => setIsSpeakingVerdict(false);
      setIsSpeakingVerdict(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Check Web Speech API support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recog = new SpeechRecognition();
        recog.continuous = false;
        recog.interimResults = false;
        recog.lang = 'en-US';

        recog.onresult = (event: any) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            setIdeaText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
          setIsListening(false);
        };

        recog.onerror = () => {
          setIsListening(false);
        };

        recog.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recog;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Speech recognition error:', err);
      }
    }
  };

  const handleReason = async (inputToUse?: string) => {
    const text = (inputToUse ?? ideaText).trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const customAi = localStorage.getItem('learnmate_custom_ai_config');
        if (customAi) headers['x-custom-ai-config'] = customAi;
      } catch {}

      const res = await fetch('/api/reason', {
        method: 'POST',
        headers,
        body: JSON.stringify({ idea: text }),
      });

      const data = await res.json();
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Failed to analyze idea.');
      }

      setAnalysis(data.analysis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportToNotepad = () => {
    if (!analysis || !onSendToNotepad) return;
    const content = [
      `# Reason With Me: ${analysis.ideaTitle}`,
      `**Feasibility Verdict:** ${analysis.feasibilityVerdict}`,
      '',
      '## Scientific Reality Check',
      analysis.scientificRealityCheck.honestVerdictExplanation,
      '',
      '**Governing Principles:**',
      ...analysis.scientificRealityCheck.governingPrinciples.map((p) => `- ${p}`),
      '',
      '**Bottlenecks & Constraints:**',
      ...analysis.scientificRealityCheck.criticalBottlenecks.map((b) => `- ${b}`),
      '',
      '## Constructive Engineering Pivot',
      analysis.constructiveEngineeringPivot,
      '',
      '## Step-by-Step Implementation Roadmap',
      ...analysis.roadmap.map(
        (r) => `### ${r.phase}: ${r.title}\n${r.description}\n- Tools: ${r.toolsOrActions.join(', ')}`,
      ),
      '',
      `**CAD Workflow:** ${analysis.cadRecommendation.recommendedWorkflow}`,
    ].join('\n');

    onSendToNotepad(content);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Reason With Me: Idea to Life</h2>
              <p className="text-xs text-white/80">
                Speak or type your concept — get honest feasibility, CAD guidance, and an interactive blueprint
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Input Area */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
              What idea, mechanism, or project do you want to explore?
            </label>
            <div className="relative rounded-xl border border-gray-300 bg-gray-50/50 p-2 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-inner">
              <textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="Example: I want to build a lightweight 3D-printable robotic gripper in FreeCAD that uses flexible TPU tendons and a single servo motor..."
                rows={3}
                className="w-full resize-none bg-transparent p-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 px-2">
                <div className="flex items-center gap-2">
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="h-3.5 w-3.5" />
                          <span>Listening...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5 text-blue-600" />
                          <span>Speak Idea</span>
                        </>
                      )}
                    </button>
                  )}
                  <span className="text-[11px] text-gray-400">
                    No document needed
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleReason()}
                  disabled={!ideaText.trim() || isLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Reasoning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Reason & Plan</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Inspiration Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-gray-400 font-medium">Try inspiration:</span>
              {[
                '3D-printable robotic gripper in FreeCAD',
                'Dual-chamber pneumatic pulse simulator',
                'Solar powered UV-C water purifier',
                'Quadcopter avionics and telemetry bench',
              ].map((pill, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setIdeaText(pill);
                    handleReason(pill);
                  }}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition"
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Analysis Result */}
          {analysis && (
            <div className="space-y-5 pt-3 border-t border-gray-100">
              {/* Header Title & Verdict */}
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-blue-50/40 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                    System Concept Evaluation
                  </span>
                  <h3 className="text-base font-bold text-gray-900 mt-0.5">
                    {analysis.ideaTitle}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold border ${
                      analysis.feasibilityVerdict === 'Fully Feasible'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : analysis.feasibilityVerdict === 'Conditionally Feasible with Modifications'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-purple-50 text-purple-800 border-purple-200'
                    }`}
                  >
                    {analysis.feasibilityVerdict}
                  </span>

                  <button
                    type="button"
                    onClick={toggleSpeakVerdict}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      isSpeakingVerdict
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300 font-bold animate-pulse'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    title="Hands-free voice mentorship"
                  >
                    {isSpeakingVerdict ? (
                      <>
                        <VolumeX className="h-3.5 w-3.5" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Listen Aloud</span>
                      </>
                    )}
                  </button>

                  {onSendToNotepad && (
                    <button
                      type="button"
                      onClick={handleExportToNotepad}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 transition"
                      title="Save full plan to Laboratory Notepad"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Save to Notepad</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Scientific Reality Check */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Scientific Feasibility & Reality Check
                  </h4>
                </div>

                <p className="text-xs text-gray-700 leading-relaxed">
                  {analysis.scientificRealityCheck.honestVerdictExplanation}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-lg bg-blue-50/60 p-2.5 space-y-1 border border-blue-100">
                    <strong className="text-[11px] font-bold text-blue-900 block">
                      Governing Laws & Principles:
                    </strong>
                    <ul className="text-xs text-blue-800 list-disc pl-4 space-y-0.5">
                      {analysis.scientificRealityCheck.governingPrinciples.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-amber-50/60 p-2.5 space-y-1 border border-amber-100">
                    <strong className="text-[11px] font-bold text-amber-900 block">
                      Real-World Bottlenecks & Limits:
                    </strong>
                    <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                      {analysis.scientificRealityCheck.criticalBottlenecks.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Constructive Engineering Pivot */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    Constructive Engineering Pathway
                  </h4>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  {analysis.constructiveEngineeringPivot}
                </p>
              </div>

              {/* Step-by-Step Implementation Roadmap */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-purple-600" />
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Step-by-Step Implementation Roadmap
                    </h4>
                  </div>
                  <span className="text-[11px] text-gray-500 font-medium">
                    CAD Tool: <strong className="text-purple-700">{analysis.cadRecommendation.primaryTool}</strong>
                  </span>
                </div>

                <div className="space-y-3">
                  {analysis.roadmap.map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-1 hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-purple-700 uppercase">
                          {step.phase}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {step.toolsOrActions.map((t, i) => (
                            <span
                              key={i}
                              className="rounded bg-gray-200/70 px-1.5 py-0.2 text-[10px] text-gray-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <h5 className="text-xs font-bold text-gray-900">{step.title}</h5>
                      <p className="text-xs text-gray-600 leading-relaxed">{step.description}</p>
                      {step.externalCadTip && (
                        <p className="text-[11px] text-purple-700 font-medium pt-0.5">
                          📐 CAD Tip: {step.externalCadTip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action: Launch System Studio Blueprint */}
              <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wide">
                    Ready to visualize and simulate?
                  </h4>
                  <p className="text-xs text-blue-800">
                    Open the interactive 2D node-edge canvas and multi-track hands-on labs for this concept.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLaunchBlueprint(analysis.suggestedStudioTopic);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 hover:shadow-lg transition"
                >
                  <Cpu className="h-4 w-4" />
                  <span>Launch 2D Blueprint in System Studio</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
