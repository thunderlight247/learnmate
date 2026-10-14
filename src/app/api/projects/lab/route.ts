// Phase 6: Hands-on Lab & Practical Project Generator.
// Transforms theoretical lecture concepts into actionable, step-by-step
// engineering builds, lab experiments, or simulations that learners can build.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchSimilarChunks } from '@/lib/embeddings';
import { callOpenRouter } from '@/lib/openrouter';

export interface LabStep {
  stepNumber: number;
  title: string;
  instruction: string;
  safetyOrCaution?: string;
  expectedOutcome: string;
}

export interface LabTroubleshooting {
  symptom: string;
  cause: string;
  solution: string;
}

export interface HandsOnLabProtocol {
  title: string;
  objective: string;
  theoreticalPrinciple: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  requiredTools: string[];
  safetyWarnings: string[];
  steps: LabStep[];
  troubleshooting: LabTroubleshooting[];
  verificationChallenge: string;
}

const LAB_SYSTEM_PROMPT = `
You are LearnMate's Master Laboratory & Engineering Workshop Instructor.
Your mission is to take ANY theoretical concept (anatomy, physiology, drone engineering, robotics, circuits, physics, fluid dynamics) and turn it into a concrete, hands-on project that a student or maker can assemble, measure, test, and observe.

Return ONLY a valid JSON object. Do not wrap in Markdown fences.

Follow this exact JSON structure:
{
  "title": "Action-oriented project title (e.g. 'Build a Dual-Chamber Hemodynamic Pulse Rig' or 'Quadcopter Avionics & Motor Sync Testbench')",
  "objective": "What practical skill or mechanism the student will build and prove",
  "theoreticalPrinciple": "The underlying academic/scientific theory being demonstrated",
  "difficulty": "Beginner | Intermediate | Advanced",
  "estimatedTime": "e.g. 45 - 60 minutes",
  "requiredTools": ["Multimeter", "Breadboard", "Jumper wires", "Power source", etc.],
  "safetyWarnings": ["Safety guideline 1", "Safety guideline 2"],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Clear step title",
      "instruction": "Concrete, actionable step-by-step instruction using active verbs (Connect, Calibrate, Solder, Wire, Probe, Measure)",
      "safetyOrCaution": "Specific caution for this step",
      "expectedOutcome": "What empirical data, measurement, or physical response the student should observe"
    }
  ],
  "troubleshooting": [
    {
      "symptom": "What went wrong",
      "cause": "Underlying fault",
      "solution": "How to resolve it"
    }
  ],
  "verificationChallenge": "A practical experiment challenge asking the student to alter a variable and observe how the theoretical model responds"
}

Rules:
1. Practical & Real: The steps must describe actual physical hardware actions, lab bench procedures, or verifiable simulation setups.
2. Domain Adaptive:
   - For Anatomy / Medicine: Frame as an anatomical mechanical simulator, hemodynamic flow loop, prosthetic mechanism, or physiological measurement lab (e.g., ECG/pulse-oximeter circuit or Starling law hydraulic model).
   - For Robotics / Drones: Frame as breadboard/benchtop build, motor-ESC wiring, sensor bus telemetry, and PID calibration.
   - For Physics / Circuits: Frame as breadboard assembly, voltage-divider probing, resistor calculation, and oscilloscope measurement.
3. Every step MUST have an 'expectedOutcome' describing observable measurements.
4. Keep steps between 4 and 6 total steps.
`.trim();

function buildFallbackLabProtocol(
  topic: string,
  componentsList: string[],
): HandsOnLabProtocol {
  const parts = componentsList.length > 0
    ? componentsList.slice(0, 5).join(', ')
    : 'System components';

  return {
    title: `Hands-On Lab: Implementing ${topic}`,
    objective: `Build, wire, and empirically test a functional prototype demonstrating the principles of ${topic}.`,
    theoreticalPrinciple: `Directly demonstrates the physical governing dynamics and interconnected flow between ${parts}.`,
    difficulty: 'Intermediate',
    estimatedTime: '45 - 60 minutes',
    requiredTools: [
      'Digital Multimeter / Measurement gauge',
      'Breadboard & connection jumpers / Tubing',
      'Regulated DC Power supply / Fluid reservoir',
      'Component test bench & safety goggles',
    ],
    safetyWarnings: [
      'Always disconnect primary power before altering circuit wiring or fluid connections.',
      'Wear eye protection and verify polarity before energizing any component.',
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Component Inspection & Bench Preparation',
        instruction: `Gather and inspect all project components (${parts}). Verify values, pinouts, and structural integrity against your blueprint diagram.`,
        safetyOrCaution: 'Confirm all test leads are de-energized.',
        expectedOutcome: 'All components staged on the workbench with pinouts verified.',
      },
      {
        stepNumber: 2,
        title: 'Core Architecture Assembly & Interconnection',
        instruction: 'Assemble the primary subsystem nodes following the 2D canvas schematic. Connect power/input rails first, followed by signal/fluid interconnects.',
        safetyOrCaution: 'Double check polarity and avoid cross-wiring adjacent pins or valves.',
        expectedOutcome: 'Continuous pathway established across all upstream and downstream connections.',
      },
      {
        stepNumber: 3,
        title: 'Power-Up & Baseline Parameter Calibration',
        instruction: 'Apply nominal input power or baseline flow. Probe the primary junction node to establish baseline operational metrics.',
        safetyOrCaution: 'Check for immediate thermal runaway, abnormal current draw, or leakage.',
        expectedOutcome: 'Stable baseline readings matching expected theoretical specifications.',
      },
      {
        stepNumber: 4,
        title: 'Empirical Verification & Dynamic Response Testing',
        instruction: 'Exercise the system across its operational range. Record input vs output metrics to verify the governing mathematical/biological model.',
        safetyOrCaution: 'Stay within peak ratings to prevent component breakdown.',
        expectedOutcome: 'Measured data points conform closely to theoretical curves.',
      },
      {
        stepNumber: 5,
        title: 'Failure Mode Injection & Fault Diagnostics',
        instruction: 'Simulate a degradation fault (e.g. introduce high resistance or restrict line flow). Observe how dependent downstream nodes react and record symptoms.',
        safetyOrCaution: 'Execute controlled failure testing without exceeding catastrophic limits.',
        expectedOutcome: 'Observed failure response matches the predicted failure consequences.',
      },
    ],
    troubleshooting: [
      {
        symptom: 'No output or downstream activity upon power-up',
        cause: 'Improper ground reference, reversed polarity, or open circuit',
        solution: 'Trace continuity from source feeder to downstream consumer with a multimeter.',
      },
      {
        symptom: 'Readings drift or fluctuate erratically',
        cause: 'Floating input line, poor connection, or lack of decoupling/stabilization',
        solution: 'Reseat connections and verify grounding across all interconnected blocks.',
      },
    ],
    verificationChallenge: `Vary the primary input by 20% and calculate the theoretical vs measured response of the terminal end-effector.`,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      workspaceId?: string;
      topic?: string;
      mode?: 'hardware' | 'simulation' | 'experiment';
    };

    const { projectId, workspaceId, mode = 'hardware' } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'A workspaceId is required.' },
        { status: 400 },
      );
    }

    let projectTitle = body.topic || '';
    let componentsList: string[] = [];

    // If projectId is provided, enrich with actual project blueprint data
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { nodes: true, edges: true },
      });

      if (project) {
        projectTitle = projectTitle || project.title;
        if (Array.isArray(project.billOfMaterials)) {
          componentsList = (project.billOfMaterials as Array<{ item?: string }>)
            .map((b) => b.item)
            .filter((item): item is string => typeof item === 'string');
        } else if (project.nodes.length > 0) {
          componentsList = project.nodes.map((n) => {
            const props = (n.properties ?? {}) as Record<string, unknown>;
            return typeof props.label === 'string' ? props.label : n.type;
          });
        }
      }
    }

    const topicQuery = projectTitle || 'Practical Engineering & System Prototype';

    // Retrieve lecture context from vector store
    let context = '';
    try {
      const chunks = await searchSimilarChunks(topicQuery, workspaceId, 4);
      if (chunks.length > 0) {
        context = chunks.map((c, i) => `[Passage ${i + 1}]\n${c.content}`).join('\n\n---\n\n');
      }
    } catch (searchErr) {
      console.warn('RAG context retrieval skipped for lab guide:', searchErr);
    }

    // Call OpenRouter with structured prompt
    try {
      const userPrompt = `
Topic: ${topicQuery}
Lab Mode: ${mode}
Components Available: ${componentsList.length > 0 ? componentsList.join(', ') : 'Standard laboratory testbench components'}

Lecture & Document Context:
${context || 'No specific textbook passages retrieved; generate a sound multidisciplinary lab protocol based on scientific principles.'}

Create a rigorous, step-by-step hands-on laboratory build protocol for this topic.
`.trim();

      const aiResponse = await callOpenRouter(LAB_SYSTEM_PROMPT, userPrompt);
      const cleaned = aiResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned) as HandsOnLabProtocol;

      if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.steps)) {
        return NextResponse.json({ success: true, lab: parsed });
      }
    } catch (aiErr) {
      console.warn('AI lab generation failed or timed out, using fallback synthesizer:', aiErr);
    }

    // High quality pedagogical fallback
    const fallback = buildFallbackLabProtocol(topicQuery, componentsList);
    return NextResponse.json({ success: true, lab: fallback });
  } catch (error: unknown) {
    console.error('Hands-on Lab API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate hands-on lab protocol.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
