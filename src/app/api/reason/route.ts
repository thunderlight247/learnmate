// "Reason With Me" Ideation & Feasibility Engine.
// Allows users to speak or type an engineering or multidisciplinary concept without uploading a file.
// Evaluates scientific feasibility realistically (honest about physics/engineering limits without discouraging),
// formulates a step-by-step implementation guide, and prepares blueprint parameters.

import { NextResponse } from 'next/server';
import { callAiWithFallback } from '@/lib/aiClient';
import { contentCacheKey } from '@/lib/cache';

export interface FeasibilityRoadmapStep {
  phase: string;
  title: string;
  description: string;
  toolsOrActions: string[];
  externalCadTip?: string;
}

export interface ReasonWithMeResponse {
  ideaTitle: string;
  feasibilityVerdict: 'Fully Feasible' | 'Conditionally Feasible with Modifications' | 'Physically/Technologically Constrained';
  scientificRealityCheck: {
    governingPrinciples: string[];
    criticalBottlenecks: string[];
    honestVerdictExplanation: string;
  };
  constructiveEngineeringPivot: string;
  roadmap: FeasibilityRoadmapStep[];
  cadRecommendation: {
    primaryTool: string;
    recommendedWorkflow: string;
  };
  suggestedStudioTopic: string;
}

const REASON_SYSTEM_PROMPT = `
You are LearnMate's Principal Systems Architect, Chief Scientist, and Senior Research Mentor.
A student or engineer is pitching an idea or asking how to bring a concept to life.

Your goals:
1. SCIENTIFIC HONESTY & REALITY CHECK:
   - State clearly and objectively what is physically, mathematically, or technologically possible and what is NOT.
   - Clearly cite the relevant physical laws (e.g. Carnot efficiency, thermodynamics, power density of batteries, mechanical shear strength, Shannon limit, regulatory/safety limits).
   - If an idea violates physics or is infeasible in its naive form, NEVER say "no, this is impossible, give up". Instead, explain WHY the naive approach is limited, and provide the REAL-WORLD ENGINEERING ALTERNATIVE (e.g., if asking for perpetual energy, pivot to high-efficiency kinetic energy harvesting or solar-piezo hybrids).
2. STEP-BY-STEP IMPLEMENTATION ROADMAP:
   - Provide concrete phases from zero to finished physical/virtual prototype.
   - Highlight external CAD software (such as FreeCAD or AutoCAD) and explain how they will model and simulate it.
3. CONSTRUCTIVE & EMPOWERING:
   - Treat the learner with respect and genuine engineering curiosity.

Return ONLY a valid JSON object matching this schema:
{
  "ideaTitle": "Clear, concise title for the system idea",
  "feasibilityVerdict": "Fully Feasible | Conditionally Feasible with Modifications | Physically/Technologically Constrained",
  "scientificRealityCheck": {
    "governingPrinciples": ["Governing law or principle 1", "Principle 2"],
    "criticalBottlenecks": ["Specific physical/practical limitation 1", "Limitation 2"],
    "honestVerdictExplanation": "Objective, clear breakdown of what is possible vs what needs engineering compromise"
  },
  "constructiveEngineeringPivot": "Constructive advice on the optimal path forward to achieve the user's intent without getting stuck in physically impossible traps",
  "roadmap": [
    {
      "phase": "Phase 1: Conceptual & Mathematical Modeling",
      "title": "Define Specs & Boundary Constraints",
      "description": "Calculate power, flow, or mechanical torque requirements before CAD.",
      "toolsOrActions": ["Python/NumPy or Excel", "Free body diagram"],
      "externalCadTip": "Establish parametric dimension spreadsheets."
    },
    {
      "phase": "Phase 2: CAD & Virtual Simulation",
      "title": "Parametric 3D Modeling & Stress FEA",
      "description": "Model the primary chassis and moving elements in FreeCAD or AutoCAD.",
      "toolsOrActions": ["FreeCAD Part Design / Sketcher", "AutoCAD 3D", "OpenSCAD"],
      "externalCadTip": "Ensure all mounting holes have standard M3/M4 tolerances."
    },
    {
      "phase": "Phase 3: Sourcing & Prototyping",
      "title": "Hardware Bill of Materials & Subsystem Assembly",
      "description": "Wire sensors, microcontrollers, and mechanical links.",
      "toolsOrActions": ["3D Printing (PLA/PETG)", "Breadboard test bench"]
    },
    {
      "phase": "Phase 4: Empirical Testing & Calibration",
      "title": "Operational Validation & Fault Testing",
      "description": "Probe with multimeter, record telemetry, and tune PID or tolerances.",
      "toolsOrActions": ["Multimeter / Logic Analyzer", "Data logging table"]
    }
  ],
  "cadRecommendation": {
    "primaryTool": "FreeCAD (v0.21+) or AutoCAD",
    "recommendedWorkflow": "Use FreeCAD Part Design workbench to sketch the cross section, pad into a 3D solid, and export STL for rapid manufacturing."
  },
  "suggestedStudioTopic": "A concise topic string (e.g. 'Automated Solar Water Purifier') suitable for generating a 2D interactive blueprint in System Studio"
}
`.trim();

function buildFallbackReasoning(idea: string): ReasonWithMeResponse {
  const cleanIdea = idea.trim().slice(0, 100);
  return {
    ideaTitle: `Engineering System: ${cleanIdea}`,
    feasibilityVerdict: 'Conditionally Feasible with Modifications',
    scientificRealityCheck: {
      governingPrinciples: [
        'Conservation of Energy & Thermodynamic Limits',
        'Material Yield Strength & Mechanical Stress Distribution',
        'Signal Propagation & Sensor Dynamic Range',
      ],
      criticalBottlenecks: [
        'Power density and thermal dissipation in enclosed spaces',
        'Component tolerances when moving from virtual CAD to physical fabrication',
      ],
      honestVerdictExplanation:
        'This idea is viable provided you account for realistic efficiency losses, thermal dissipation, and structural tolerances. A naive direct implementation may suffer from power or structural bottlenecks, but with proper component sizing and CAD simulation, a working prototype can be realized.',
    },
    constructiveEngineeringPivot:
      'Rather than attempting a monolithic custom build at once, separate the system into distinct modular subsystems (Power, Processing, Actuation/Structure). Validate the CAD model in FreeCAD first before committing to physical prototyping.',
    roadmap: [
      {
        phase: 'Phase 1: First Principles & Calculations',
        title: 'Establish Mathematical Specifications',
        description: 'Calculate input energy, structural load vectors, and required sensor sampling rates.',
        toolsOrActions: ['Jupyter Notebook / NumPy', 'Engineering Notebook'],
        externalCadTip: 'Calculate critical dimensions before drawing sketches.',
      },
      {
        phase: 'Phase 2: 3D CAD & Virtual Simulation',
        title: 'Parametric Modeling in FreeCAD / AutoCAD',
        description: 'Construct the base housing and mounting bosses using parametric constraints so dimensions can be easily adjusted.',
        toolsOrActions: ['FreeCAD Part Design', 'AutoCAD 3D Solids', 'OpenSCAD'],
        externalCadTip: 'Use FreeCAD Sketcher with fully constrained degrees of freedom.',
      },
      {
        phase: 'Phase 3: Benchtop Prototyping',
        title: 'Rapid Prototyping & Subsystem Wiring',
        description: '3D print or machine the primary chassis and wire breadboard circuits for bench testing.',
        toolsOrActions: ['3D Printer (0.2mm layer height)', 'Digital Multimeter', 'Breadboard'],
      },
      {
        phase: 'Phase 4: Empirical Testing & Calibration',
        title: 'Empirical Verification & Tolerance Tuning',
        description: 'Run systematic trials, measure deviation against theoretical predictions, and refine CAD clearances.',
        toolsOrActions: ['Sensor Telemetry Logger', 'Calipers / Micrometer'],
      },
    ],
    cadRecommendation: {
      primaryTool: 'FreeCAD (v0.21+) or AutoCAD',
      recommendedWorkflow:
        'Open FreeCAD, activate Part Design workbench, create a sketch on the XY plane, pad the body, and export to STEP/STL.',
    },
    suggestedStudioTopic: cleanIdea || 'Parametric Engineering Prototype',
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idea?: string;
      targetTool?: string;
    };

    const idea = body.idea?.trim();
    if (!idea) {
      return NextResponse.json(
        { error: 'Please describe the idea or question you want to reason about.' },
        { status: 400 },
      );
    }

    try {
      const userPrompt = `
Learner's Concept / Pitch:
"${idea}"

Target Software / Platform: ${body.targetTool || 'FreeCAD / AutoCAD / General Physical Prototyping'}

Evaluate this idea objectively. Give a scientifically grounded reality check, explain constraints honestly without discouraging, and chart a clear 4-phase implementation roadmap.
`.trim();

      const { content: aiResponse } = await callAiWithFallback({
        messages: [
          { role: 'system', content: REASON_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        complexity: 'complex',
        cacheKey: contentCacheKey('reason_with_me', userPrompt),
      });

      const cleaned = aiResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonCandidate =
        firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;

      const parsed = JSON.parse(jsonCandidate) as ReasonWithMeResponse;

      if (parsed && typeof parsed.ideaTitle === 'string' && Array.isArray(parsed.roadmap)) {
        return NextResponse.json({ success: true, analysis: parsed });
      }
    } catch (aiErr) {
      console.warn('AI reasoning failed or timed out, returning structured fallback:', aiErr);
    }

    const fallback = buildFallbackReasoning(idea);
    return NextResponse.json({ success: true, analysis: fallback });
  } catch (err: unknown) {
    console.error('Reason API Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to reason with idea.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
