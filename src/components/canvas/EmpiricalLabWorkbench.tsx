'use client';

// Interactive Empirical Lab Workbench:
// 1. Formal Null (H0) and Alternative (H1) Hypothesis formulation.
// 2. Controlled, Independent, and Dependent variables matrix.
// 3. Interactive live data-logging table: user enters observed readings;
//    calculates Delta, Percentage Error, and Mean in real-time.
// 4. Error sources & scientific validation rubric.

import { useState, useMemo } from 'react';
import {
  FlaskConical,
  Activity,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Info,
  Scale,
} from 'lucide-react';
import type { EmpiricalLabProtocol } from '@/types/lab';

interface EmpiricalLabWorkbenchProps {
  protocol: EmpiricalLabProtocol;
  onSendToNotepad?: (content: string) => void;
}

interface UserTrialRow {
  trialNumber: number;
  inputVal: number;
  expectedVal: number;
  observedVal: string; // string so user can edit cleanly in input
}

export default function EmpiricalLabWorkbench({ protocol, onSendToNotepad }: EmpiricalLabWorkbenchProps) {
  const { hypothesisH0, hypothesisH1, variableMatrix, suggestedTrials, errorSources, analysisRubric } = protocol;

  const [trials, setTrials] = useState<UserTrialRow[]>(() =>
    suggestedTrials.map((t) => ({
      ...t,
      observedVal: (Math.round((t.expectedVal * (0.97 + Math.random() * 0.05)) * 10) / 10).toString(),
    })),
  );

  const handleObservedChange = (trialNumber: number, val: string) => {
    setTrials((prev) =>
      prev.map((t) => (t.trialNumber === trialNumber ? { ...t, observedVal: val } : t)),
    );
  };

  const handleAddTrial = () => {
    const nextNum = trials.length + 1;
    const lastInput = trials[trials.length - 1]?.inputVal ?? 10;
    const lastExpected = trials[trials.length - 1]?.expectedVal ?? 20;
    setTrials((prev) => [
      ...prev,
      {
        trialNumber: nextNum,
        inputVal: Math.round(lastInput + 10),
        expectedVal: Math.round(lastExpected + 20),
        observedVal: '',
      },
    ]);
  };

  const handleRemoveTrial = (trialNumber: number) => {
    if (trials.length <= 1) return;
    setTrials((prev) => prev.filter((t) => t.trialNumber !== trialNumber));
  };

  // Compute stats across all filled trials
  const computedStats = useMemo(() => {
    let totalError = 0;
    let filledCount = 0;
    let totalObserved = 0;

    const rowMetrics = trials.map((t) => {
      const obs = parseFloat(t.observedVal);
      if (isNaN(obs)) {
        return { delta: null, percentError: null, obsNum: null };
      }
      filledCount++;
      totalObserved += obs;
      const delta = Math.round(Math.abs(obs - t.expectedVal) * 100) / 100;
      const percent = t.expectedVal !== 0
        ? Math.round((delta / Math.abs(t.expectedVal)) * 1000) / 10
        : 0;
      totalError += percent;
      return { delta, percentError: percent, obsNum: obs };
    });

    const averageError = filledCount > 0 ? Math.round((totalError / filledCount) * 10) / 10 : null;
    const meanObserved = filledCount > 0 ? Math.round((totalObserved / filledCount) * 10) / 10 : null;

    return { rowMetrics, averageError, meanObserved, filledCount };
  }, [trials]);

  const handleExportToNotepad = () => {
    if (!onSendToNotepad) return;
    const rows = trials
      .map(
        (t, i) =>
          `| Trial ${t.trialNumber} | Input: ${t.inputVal} | Expected: ${t.expectedVal} | Observed: ${t.observedVal || 'N/A'} | Error: ${computedStats.rowMetrics[i]?.percentError ?? 'N/A'}% |`,
      )
      .join('\n');

    const content = [
      `### Empirical Experiment: ${protocol.title}`,
      `**H0:** ${hypothesisH0}`,
      `**H1:** ${hypothesisH1}`,
      `**Average Error Rate:** ${computedStats.averageError ?? 'N/A'}%`,
      '',
      '| Trial | Input | Expected | Observed | Error |',
      '|---|---|---|---|---|',
      rows,
    ].join('\n');

    onSendToNotepad(content);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: HYPOTHESIS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
            <Scale className="h-4 w-4 text-gray-500" />
            <span>Null Hypothesis (H₀)</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed font-serif italic">
            "{hypothesisH0}"
          </p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
            <FlaskConical className="h-4 w-4 text-indigo-600" />
            <span>Alternative Hypothesis (H₁)</span>
          </div>
          <p className="text-xs text-indigo-900/90 leading-relaxed font-serif italic">
            "{hypothesisH1}"
          </p>
        </div>
      </div>

      {/* SECTION 2: VARIABLE MATRIX */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
          Variable Isolation Matrix
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 space-y-1">
            <span className="text-[10px] font-bold text-blue-700 uppercase">
              Independent Variable (X)
            </span>
            <p className="text-xs font-semibold text-gray-900">{variableMatrix.independent.name}</p>
            <span className="text-[11px] text-gray-500 block">Unit: {variableMatrix.independent.unit}</span>
          </div>

          <div className="rounded-lg border border-purple-100 bg-purple-50/40 p-2.5 space-y-1">
            <span className="text-[10px] font-bold text-purple-700 uppercase">
              Dependent Variable (Y)
            </span>
            <p className="text-xs font-semibold text-gray-900">{variableMatrix.dependent.name}</p>
            <span className="text-[11px] text-gray-500 block">Unit: {variableMatrix.dependent.unit}</span>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5 space-y-1">
            <span className="text-[10px] font-bold text-amber-800 uppercase">
              Controlled Constants
            </span>
            <ul className="text-[11px] text-gray-600 list-disc pl-3.5 space-y-0.5">
              {variableMatrix.controlled.slice(0, 3).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* SECTION 3: INTERACTIVE DATA-LOGGING TABLE */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Interactive Observational Data Logger
              </h4>
              <p className="text-[11px] text-gray-500">
                Type observed readings from your instruments to calculate error & variance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSendToNotepad && (
              <button
                type="button"
                onClick={handleExportToNotepad}
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 hover:text-emerald-700 transition"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Save to Notepad</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAddTrial}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Trial</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-semibold uppercase text-[10px]">
                <th className="pb-2">Trial</th>
                <th className="pb-2">Input (X)</th>
                <th className="pb-2">Theoretical (Exp)</th>
                <th className="pb-2">Your Observation (Obs)</th>
                <th className="pb-2">Delta (|Obs-Exp|)</th>
                <th className="pb-2">Percent Error</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {trials.map((t, index) => {
                const metric = computedStats.rowMetrics[index];
                const isAcceptable = metric?.percentError !== null && metric.percentError < 10;
                return (
                  <tr key={t.trialNumber} className="hover:bg-gray-50/60 transition">
                    <td className="py-2.5 font-bold text-gray-900">Trial #{t.trialNumber}</td>
                    <td className="py-2.5 font-mono text-gray-700">{t.inputVal}</td>
                    <td className="py-2.5 font-mono text-gray-500">{t.expectedVal}</td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        step="any"
                        value={t.observedVal}
                        onChange={(e) => handleObservedChange(t.trialNumber, e.target.value)}
                        placeholder="e.g. 24.5"
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs font-mono font-semibold focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="py-2.5 font-mono text-gray-700">
                      {metric?.delta !== null ? metric.delta : '—'}
                    </td>
                    <td className="py-2.5">
                      {metric?.percentError !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono font-bold text-[11px] ${
                            isAcceptable
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {metric.percentError}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {trials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTrial(t.trialNumber)}
                          className="text-gray-400 hover:text-red-600 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Statistical Summary Bar */}
          <div className="mt-4 rounded-lg bg-gray-50 p-3 flex flex-wrap items-center justify-between gap-3 text-xs border border-gray-200">
            <div className="flex items-center gap-4">
              <span>
                <strong className="text-gray-700">Completed Trials:</strong>{' '}
                <span className="font-mono">{computedStats.filledCount} / {trials.length}</span>
              </span>
              <span>
                <strong className="text-gray-700">Mean Output:</strong>{' '}
                <span className="font-mono">{computedStats.meanObserved ?? '—'}</span>
              </span>
              <span>
                <strong className="text-gray-700">Average Error:</strong>{' '}
                <span
                  className={`font-mono font-bold ${
                    computedStats.averageError !== null && computedStats.averageError < 10
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {computedStats.averageError !== null ? `${computedStats.averageError}%` : '—'}
                </span>
              </span>
            </div>

            <div className="text-[11px] text-gray-500">
              {computedStats.averageError !== null && computedStats.averageError < 10 ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Empirical data confirms H₁
                </span>
              ) : (
                <span>Review calibration to reduce error margin below 10%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: ERROR ANALYSIS & RUBRIC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2">
          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
            Systematic vs Random Error Sources
          </h5>
          <div className="space-y-1.5 text-xs text-gray-700">
            <div>
              <strong className="text-gray-900 block text-[11px]">Systematic Sources:</strong>
              <ul className="list-disc pl-4 text-[11px] text-gray-600">
                {errorSources.systematicErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong className="text-gray-900 block text-[11px]">Random Noise:</strong>
              <ul className="list-disc pl-4 text-[11px] text-gray-600">
                {errorSources.randomErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2">
          <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
            Scientific Analysis Rubric
          </h5>
          <p className="text-xs text-gray-600 leading-relaxed">
            {analysisRubric}
          </p>
        </div>
      </div>
    </div>
  );
}
