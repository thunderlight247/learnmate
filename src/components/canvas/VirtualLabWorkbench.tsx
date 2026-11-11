'use client';

// Interactive Virtual Lab Workbench:
// 1. In-browser parameter simulator with live sliders and dynamic telemetry calculations.
// 2. Interactive In-Browser 3D CAD Geometry Previewer (orbit, rotate, zoom).
// 3. Ready-to-copy and One-Click Downloadable FreeCAD (.FCMacro) & AutoCAD (.lsp) scripts.
// 4. Step-by-step external tool guide with hands-free audio narration.

import { useState, useMemo } from 'react';
import {
  Code,
  Copy,
  Check,
  Sliders,
  Activity,
  BookOpen,
  Layers,
  Download,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Cad3DPreviewer from './Cad3DPreviewer';
import { previewHeightFor } from '@/lib/lab-geometry';
import type { VirtualLabProtocol } from '@/types/lab';

interface VirtualLabWorkbenchProps {
  protocol: VirtualLabProtocol;
  onSendToNotepad?: (content: string) => void;
}

export default function VirtualLabWorkbench({ protocol, onSendToNotepad }: VirtualLabWorkbenchProps) {
  const { simulationWorkbench, cadExports, externalSoftwareGuide } = protocol;

  // Initialize interactive parameter values from protocol defaults
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    simulationWorkbench.parameters.forEach((p) => {
      initial[p.id] = p.defaultValue;
    });
    return initial;
  });

  const [activeCadTab, setActiveCadTab] = useState<'freecad' | 'autocad' | 'openscad'>('freecad');
  const [section, setSection] = useState<'preview' | 'simulator' | 'scripts' | 'guide'>('preview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [predictionText, setPredictionText] = useState('');
  const [activeSpeakingStep, setActiveSpeakingStep] = useState<number | null>(null);

  const handleParamChange = (id: string, value: number) => {
    setParamValues((prev) => ({ ...prev, [id]: value }));
  };

  // Map the chosen parameter's range onto a 20-60 mm enclosure height for the preview.
  // The learner can pick a different parameter in the preview section (item 6).
  const [geometryParamId, setGeometryParamId] = useState<string | undefined>(
    simulationWorkbench.geometryParameterId,
  );
  const primaryParamForPreview =
    simulationWorkbench.parameters.find((p) => p.id === geometryParamId) ??
    simulationWorkbench.parameters[0];
  const previewHeight = primaryParamForPreview
    ? previewHeightFor(
        paramValues[primaryParamForPreview.id] ?? primaryParamForPreview.defaultValue,
        primaryParamForPreview.min,
        primaryParamForPreview.max,
      )
    : 40;

  // Calculate live telemetry outputs based on user parameters
  const calculatedTelemetry = useMemo(() => {
    // Every slider contributes: the normalized settings are averaged, so moving
    // any parameter (not only the first) changes the telemetry.
    const params = simulationWorkbench.parameters;
    const norm = params.length
      ? params.reduce((sum, p) => {
          const v = paramValues[p.id] ?? p.defaultValue;
          return sum + (v - p.min) / (p.max - p.min || 1);
        }, 0) / params.length
      : 0.5;

    return simulationWorkbench.telemetryOutputs.map((out) => {
      let computed = out.baseValue;
      if (out.formulaType === 'linear') {
        computed = Math.round((out.baseValue * (0.6 + 0.8 * norm)) * 10) / 10;
      } else if (out.formulaType === 'inverse') {
        computed = Math.round((out.baseValue / (0.4 + 1.2 * norm)) * 10) / 10;
      } else if (out.formulaType === 'quadratic') {
        computed = Math.round((out.baseValue * (0.3 + 1.4 * norm * norm)) * 10) / 10;
      } else if (out.formulaType === 'resonant') {
        const diff = Math.abs(norm - 0.7);
        computed = Math.round(Math.max(10, out.baseValue * (1 - diff * 0.8)) * 10) / 10;
      }
      return { ...out, calculatedValue: computed };
    });
  }, [paramValues, simulationWorkbench]);

  const copyCode = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getActiveCode = () => {
    if (activeCadTab === 'freecad') return cadExports.freeCadMacro;
    if (activeCadTab === 'autocad') return cadExports.autoCadScript;
    return cadExports.openScadOrSpice;
  };

  const handleDownloadCadFile = () => {
    const code = getActiveCode();
    let filename = `LearnMate-FreeCAD-Macro-${Date.now()}.FCMacro`;
    let mime = 'text/x-python';
    if (activeCadTab === 'autocad') {
      filename = `LearnMate-AutoCAD-Routine-${Date.now()}.lsp`;
      mime = 'text/plain';
    } else if (activeCadTab === 'openscad') {
      filename = `LearnMate-OpenSCAD-${Date.now()}.scad`;
      mime = 'text/plain';
    }

    const blob = new Blob([code], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSpeechStep = (stepNumber: number, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (activeSpeakingStep === stepNumber) {
      window.speechSynthesis.cancel();
      setActiveSpeakingStep(null);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.onend = () => setActiveSpeakingStep(null);
      utterance.onerror = () => setActiveSpeakingStep(null);
      setActiveSpeakingStep(stepNumber);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        Illustrative preview only: the geometry is a generic enclosure and telemetry uses example formulas, not a validated model of your project. Do not use these values for engineering decisions.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Virtual lab tools">
        {([
          ['preview', 'Example 3D preview'],
          ['simulator', 'Example simulator'],
          ['scripts', 'CAD scripts'],
          ['guide', 'External tool guide'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSection(id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${section === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
        ))}
      </nav>
      {section === 'preview' && <>
      {/* SECTION 1: IN-BROWSER 3D CAD GEOMETRY PREVIEWER */}
      {/* The selected simulator parameter drives the enclosure height, so the sliders and the 3D model stay linked. */}
      {simulationWorkbench.parameters.length > 1 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          3D height driven by
          <select
            value={primaryParamForPreview?.id ?? ''}
            onChange={(e) => setGeometryParamId(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            {simulationWorkbench.parameters.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      )}
      <Cad3DPreviewer
        title={protocol.title}
        dimensions={{ length: 110, width: 70, height: previewHeight }}
      />

      </>}
      {section === 'simulator' && <>
      {/* SECTION 2: IN-BROWSER SIMULATOR WORKBENCH */}
      <div className="rounded-xl border border-indigo-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-blue-50/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                Interactive Virtual Simulator
              </h4>
              <p className="text-xs text-indigo-700/80">{simulationWorkbench.engineName}</p>
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 animate-pulse">
            <Activity className="h-3 w-3" />
            Illustrative values
          </span>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {simulationWorkbench.description}
          </p>

          {/* Governing Formula */}
          {simulationWorkbench.formulaDisplay && (
            <div className="rounded-lg border border-gray-200/70 bg-gray-50/70 p-2.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500">Governing Dynamic:</span>
              <code className="text-xs font-mono font-bold text-indigo-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                {simulationWorkbench.formulaDisplay}
              </code>
            </div>
          )}

          {/* Parameter Sliders */}
          <div className="space-y-3 pt-1">
            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Tune Parameter Controls
            </h5>
            <div className="grid grid-cols-1 gap-3">
              {simulationWorkbench.parameters.map((param) => {
                const val = paramValues[param.id] ?? param.defaultValue;
                return (
                  <div
                    key={param.id}
                    className="rounded-lg border border-gray-200/80 bg-white p-3 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-800">
                        {param.label}
                      </label>
                      <span className="rounded bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-mono font-bold text-indigo-700">
                        {val} {param.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={val}
                      onChange={(e) => handleParamChange(param.id, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                      <span>{param.min} {param.unit}</span>
                      <span className="text-sm text-gray-500">{param.description}</span>
                      <span>{param.max} {param.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Predict-then-reveal practice: the learner guesses the first output before the readout unlocks. */}
          {calculatedTelemetry.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <label className="block text-xs font-semibold text-amber-900" htmlFor="vlab-predict">
                Predict first: what will {calculatedTelemetry[0].label} be at {paramValues[simulationWorkbench.parameters[0]?.id ?? ''] ?? '—'} {simulationWorkbench.parameters[0]?.unit ?? ''}?
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="vlab-predict"
                  type="number"
                  value={predictionText}
                  onChange={(e) => setPredictionText(e.target.value)}
                  placeholder="Your guess"
                  className="w-32 rounded border border-amber-300 bg-white px-2 py-1 text-sm"
                />
                <span className="text-xs text-amber-800">
                  {predictionText.trim() === '' ? 'Enter a guess to reveal the readout.' : 'Readout unlocked.'}
                </span>
              </div>
              {predictionText.trim() !== '' && calculatedTelemetry[0] && (
                <p className="text-xs text-amber-900" data-testid="vlab-compare">
                  Your guess: {predictionText} {calculatedTelemetry[0].unit}. Model (illustrative, not measured data): {calculatedTelemetry[0].calculatedValue} {calculatedTelemetry[0].unit}. Difference: {Math.round((Number(predictionText) - calculatedTelemetry[0].calculatedValue) * 10) / 10} {calculatedTelemetry[0].unit}.
                </p>
              )}
            </div>
          )}

          {/* Real-time Telemetry Dashboard */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Live Calculated Telemetry Readout
            </h5>
            {predictionText.trim() === '' ? (
              <p className="text-sm text-gray-500">Make your prediction above to see the readout.</p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {calculatedTelemetry.map((tel) => (
                <div
                  key={tel.id}
                  className="rounded-lg border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white p-3 text-center"
                >
                  <span className="text-xs font-medium text-gray-500 block truncate">
                    {tel.label}
                  </span>
                  <span className="text-lg font-bold font-mono text-indigo-950 mt-0.5 block">
                    {tel.calculatedValue}{' '}
                    <span className="text-xs font-normal text-indigo-600">{tel.unit}</span>
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>

      </>}
      {section === 'scripts' && <>
      {/* SECTION 3: CAD SCRIPT GENERATOR & ONE-CLICK DOWNLOADS */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Code className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Virtual Sample & CAD Script Generator
              </h4>
              <p className="text-sm text-gray-500">
                Executable scripts for FreeCAD (Python) &amp; AutoCAD (AutoLISP)
              </p>
            </div>
          </div>

          {/* Tool Tab Switcher */}
          <div className="flex rounded-lg bg-gray-200/80 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveCadTab('freecad')}
              className={`rounded-md px-2.5 py-1 transition ${
                activeCadTab === 'freecad'
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              FreeCAD Python
            </button>
            <button
              type="button"
              onClick={() => setActiveCadTab('autocad')}
              className={`rounded-md px-2.5 py-1 transition ${
                activeCadTab === 'autocad'
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              AutoCAD (LISP)
            </button>
            <button
              type="button"
              onClick={() => setActiveCadTab('openscad')}
              className={`rounded-md px-2.5 py-1 transition ${
                activeCadTab === 'openscad'
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              OpenSCAD / SPICE
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-600 font-medium">
              {activeCadTab === 'freecad'
                ? 'FreeCAD Parametric Python Macro (.FCMacro / .py)'
                : activeCadTab === 'autocad'
                ? 'AutoCAD AutoLISP Geometry Routine (.lsp)'
                : 'OpenSCAD Parametric Blueprint (.scad)'}
            </span>

            <div className="flex items-center gap-2">
              {/* One-Click File Downloader */}
              <button
                type="button"
                onClick={handleDownloadCadFile}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition shadow-xs"
                title="Download direct file to disk"
              >
                <Download className="h-3.5 w-3.5" />
                <span>
                  {activeCadTab === 'freecad'
                    ? 'Download .FCMacro'
                    : activeCadTab === 'autocad'
                    ? 'Download .lsp'
                    : 'Download .scad'}
                </span>
              </button>

              {onSendToNotepad && (
                <button
                  type="button"
                  onClick={() => onSendToNotepad(getActiveCode())}
                  className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition"
                  title="Send to Laboratory Notepad"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Send to Notepad</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => copyCode(getActiveCode(), activeCadTab)}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
              >
                {copiedKey === activeCadTab ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Syntax Code Box */}
          <div className="relative rounded-lg border border-gray-800 bg-gray-950 p-3 overflow-x-auto max-h-[280px]">
            <pre className="text-xs font-mono text-emerald-400 whitespace-pre leading-relaxed">
              <code>{getActiveCode()}</code>
            </pre>
          </div>

          <p className="text-xs text-gray-500 italic">
            💡 {cadExports.instructions}
          </p>
        </div>
      </div>

      </>}
      {section === 'guide' && <>
      {/* SECTION 4: STEP-BY-STEP EXTERNAL SOFTWARE IMPLEMENTATION GUIDE */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                External Tool Implementation Guide
              </h4>
              <p className="text-sm text-gray-500">
                Recommended Software: <strong className="text-purple-700 font-semibold">{externalSoftwareGuide.recommendedTool}</strong>
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-gray-500">
            Practice in your own local CAD software
          </span>
        </div>

        <div className="space-y-3">
          {externalSoftwareGuide.steps.map((st) => (
            <div
              key={st.stepNumber}
              className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-1.5 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                    {st.stepNumber}
                  </span>
                  <h5 className="text-sm font-bold text-gray-900">{st.actionTitle}</h5>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-200/80 px-2 py-0.5 text-xs font-mono text-gray-700">
                    {st.softwareFeature}
                  </span>
                  {/* Audio Narrator for this step */}
                  <button
                    type="button"
                    onClick={() =>
                      toggleSpeechStep(
                        st.stepNumber,
                        `Step ${st.stepNumber}: ${st.actionTitle}. ${st.instruction} ${st.tip ? `Tip: ${st.tip}` : ''}`,
                      )
                    }
                    className={`rounded p-1 transition ${
                      activeSpeakingStep === st.stepNumber
                        ? 'bg-purple-200 text-purple-800 animate-pulse'
                        : 'text-gray-400 hover:text-purple-600'
                    }`}
                    title="Listen to this step hands-free"
                  >
                    {activeSpeakingStep === st.stepNumber ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-700 pl-7 leading-relaxed">{st.instruction}</p>
              {st.tip && (
                <p className="text-xs text-purple-700 pl-7 font-medium">
                  💡 Tip: {st.tip}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      </>}
    </div>
  );
}
