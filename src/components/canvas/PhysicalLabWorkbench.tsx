'use client';

// Interactive Physical Lab Workbench:
// 1. Benchtop tools & physical Bill of Materials.
// 2. Safety warnings with clear icons.
// 3. Step-by-step physical assembly checklist with completion tracking.
// 4. Troubleshooting faults and physical verification challenge.

import { useState } from 'react';
import {
  Wrench,
  AlertOctagon,
  CheckSquare,
  Square,
  CheckCircle2,
  BookOpen,
  Copy,
  Check,
  Package,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type { PhysicalLabProtocol } from '@/types/lab';

interface PhysicalLabWorkbenchProps {
  protocol: PhysicalLabProtocol;
  onSendToNotepad?: (content: string) => void;
}

export default function PhysicalLabWorkbench({ protocol, onSendToNotepad }: PhysicalLabWorkbenchProps) {
  const { requiredTools, safetyWarnings, physicalBillOfMaterials, steps, troubleshooting, verificationChallenge } = protocol;

  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [copiedManual, setCopiedManual] = useState(false);

  const toggleStep = (stepNumber: number) => {
    setCompletedSteps((prev) =>
      prev.includes(stepNumber) ? prev.filter((s) => s !== stepNumber) : [...prev, stepNumber],
    );
  };

  const progressPercent = steps.length > 0
    ? Math.round((completedSteps.length / steps.length) * 100)
    : 0;

  const handleCopyMarkdown = () => {
    const md = [
      `# ${protocol.title}`,
      `**Objective:** ${protocol.objective}`,
      `**Theoretical Principle:** ${protocol.theoreticalPrinciple}`,
      `**Estimated Time:** ${protocol.estimatedTime}`,
      `**Difficulty:** ${protocol.difficulty}`,
      '',
      '## Required Tools',
      ...requiredTools.map((t) => `- ${t}`),
      '',
      '## Physical Bill of Materials',
      '| Item | Spec | Purpose |',
      '|---|---|---|',
      ...(physicalBillOfMaterials || []).map((b) => `| ${b.item} | ${b.spec} | ${b.purpose} |`),
      '',
      '## Step-by-Step Build Protocol',
      ...steps.map(
        (s) =>
          `### Step ${s.stepNumber}: ${s.title}\n${s.instruction}\n- **Expected Outcome:** ${s.expectedOutcome}${
            s.safetyOrCaution ? `\n- **Caution:** ${s.safetyOrCaution}` : ''
          }`,
      ),
      '',
      '## Verification Challenge',
      verificationChallenge,
    ].join('\n');

    navigator.clipboard.writeText(md);
    setCopiedManual(true);
    setTimeout(() => setCopiedManual(false), 2000);
  };

  const handleExportToNotepad = () => {
    if (!onSendToNotepad) return;
    const content = [
      `### Physical Lab Build: ${protocol.title}`,
      `**Objective:** ${protocol.objective}`,
      '',
      '**Checklist Status:**',
      ...steps.map(
        (s) =>
          `- [${completedSteps.includes(s.stepNumber) ? 'x' : ' '}] Step ${s.stepNumber}: ${s.title} (${s.instruction})`,
      ),
      '',
      `**Challenge:** ${verificationChallenge}`,
    ].join('\n');

    onSendToNotepad(content);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: REQUIRED TOOLS & EQUIPMENT */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-800 text-white shadow-sm">
              <Wrench className="h-4 w-4" />
            </div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
              Required Benchtop Tools & Equipment
            </h4>
          </div>
          <div className="flex items-center gap-2">
            {onSendToNotepad && (
              <button
                type="button"
                onClick={handleExportToNotepad}
                className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Save to Notepad</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition"
            >
              {copiedManual ? (
                <>
                  <Check className="h-3 w-3 text-green-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Manual</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {requiredTools.map((tool, idx) => (
            <span
              key={idx}
              className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-800 font-medium"
            >
              🛠️ {tool}
            </span>
          ))}
        </div>
      </div>

      {/* SECTION 2: PHYSICAL BILL OF MATERIALS */}
      {physicalBillOfMaterials && physicalBillOfMaterials.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-600" />
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
              Physical Bill of Materials (BOM)
            </h4>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 font-semibold uppercase text-[10px]">
                  <th className="pb-2">Component Item</th>
                  <th className="pb-2">Specification / Rating</th>
                  <th className="pb-2">Functional Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {physicalBillOfMaterials.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/60 transition">
                    <td className="py-2 font-semibold text-gray-900">{item.item}</td>
                    <td className="py-2 font-mono text-gray-600">{item.spec}</td>
                    <td className="py-2 text-gray-600">{item.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: SAFETY & PRECAUTIONS */}
      {safetyWarnings && safetyWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <AlertOctagon className="h-4 w-4 text-amber-600" />
            <h4>Workshop Safety Precautions</h4>
          </div>
          <ul className="list-disc pl-4 space-y-1 text-xs text-amber-800 leading-relaxed">
            {safetyWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SECTION 4: STEP-BY-STEP ASSEMBLY PROTOCOL */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
              Physical Assembly & Wiring Steps
            </h4>
            <p className="text-[11px] text-gray-500">Check off steps as you wire and test on your bench</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700">
              {progressPercent}%
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((st) => {
            const isDone = completedSteps.includes(st.stepNumber);
            return (
              <div
                key={st.stepNumber}
                onClick={() => toggleStep(st.stepNumber)}
                className={`rounded-lg border p-3 space-y-2 cursor-pointer transition ${
                  isDone
                    ? 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button type="button" className="mt-0.5 shrink-0 text-gray-400 hover:text-emerald-600">
                    {isDone ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h5 className={`text-xs font-bold ${isDone ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        Step {st.stepNumber}: {st.title}
                      </h5>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${isDone ? 'text-gray-500' : 'text-gray-700'}`}>
                      {st.instruction}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 text-[11px]">
                      <span className="font-medium text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded w-fit">
                        ✓ Expected Observation: {st.expectedOutcome}
                      </span>
                      {st.safetyOrCaution && (
                        <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-100/60 w-fit">
                          ⚠️ Caution: {st.safetyOrCaution}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 5: TROUBLESHOOTING & CHALLENGE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {troubleshooting && troubleshooting.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2">
            <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
              Bench Troubleshooting Guide
            </h5>
            <div className="space-y-2 text-xs">
              {troubleshooting.map((tr, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-2 space-y-0.5 border border-gray-100">
                  <strong className="text-red-700 font-semibold block text-[11px]">Fault: {tr.symptom}</strong>
                  <p className="text-gray-600 text-[11px]">Cause: {tr.cause}</p>
                  <p className="text-emerald-700 font-medium text-[11px]">Fix: {tr.solution}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {verificationChallenge && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2">
            <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
              Physical Verification Challenge
            </h5>
            <p className="text-xs text-indigo-900 leading-relaxed">
              {verificationChallenge}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
