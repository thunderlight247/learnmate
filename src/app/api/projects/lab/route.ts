// Phase 6 & Next-Gen: Multi-Track Hands-On Lab Generator.
// Transforms theoretical concepts into:
// 1. Physical Lab: Real-world benchtop assembly, wiring, and multimeter verification.
// 2. Virtual Lab: Interactive in-browser parameter simulator + exportable FreeCAD (Python) / AutoCAD (AutoLISP) scripts + step-by-step external tool guide.
// 3. Empirical Lab: Scientific hypothesis ($H_0 / H_1$), controlled variables, and an interactive data logging table.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchSimilarChunks } from '@/lib/embeddings';
import { callAiWithFallback } from '@/lib/aiClient';
import { contentCacheKey } from '@/lib/cache';
import type {
  HandsOnLabProtocol,
  LabTrackMode,
  PhysicalLabProtocol,
  VirtualLabProtocol,
  EmpiricalLabProtocol,
} from '@/types/lab';

export type {
  HandsOnLabProtocol,
  LabTrackMode,
  PhysicalLabProtocol,
  VirtualLabProtocol,
  EmpiricalLabProtocol,
};

// ==================== SYSTEM PROMPTS ====================

const PHYSICAL_PROMPT = `
You are LearnMate's Master Laboratory & Hardware Workshop Director.
Your mission is to generate a rigorous PHYSICAL workbench build protocol for this topic.
The student will assemble physical hardware, wire circuits, connect mechanical/fluid links, and measure with physical instruments.

Return ONLY a valid JSON object matching this schema:
{
  "mode": "hardware",
  "title": "Action-oriented physical build title",
  "objective": "What concrete physical system the learner builds and tests",
  "theoreticalPrinciple": "The governing physical/biological theory being demonstrated",
  "difficulty": "Beginner | Intermediate | Advanced",
  "estimatedTime": "e.g. 45 - 60 minutes",
  "requiredTools": ["Digital Multimeter", "Breadboard / Chassis", "Soldering iron or jumper leads", "Power supply"],
  "safetyWarnings": ["Safety guideline 1", "Safety guideline 2"],
  "physicalBillOfMaterials": [
    { "item": "Component Name", "spec": "Operational spec (e.g. 5V, 10k Ohm, 12mm)", "purpose": "Role in assembly" }
  ],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Clear step title",
      "instruction": "Actionable benchtop instruction with verbs like Wire, Solder, Mount, Calibrate",
      "safetyOrCaution": "Precaution for this step",
      "expectedOutcome": "Observed physical/electrical metric"
    }
  ],
  "troubleshooting": [
    { "symptom": "What went wrong", "cause": "Probable fault", "solution": "Remedy" }
  ],
  "verificationChallenge": "A physical measurement challenge asking learner to adjust a knob or component and observe results"
}
`.trim();

const VIRTUAL_PROMPT = `
You are LearnMate's Virtual Simulation & Computational Engineering Specialist.
Your mission is to generate an interactive VIRTUAL LAB with:
1. An in-browser interactive simulator with tunable parameters and telemetry equations.
2. A REAL, VALID FreeCAD Python macro script that programmatically models 3D parts using FreeCAD Part/Draft modules.
3. A real AutoCAD AutoLISP script or parametric command sequence for CAD software.
4. Step-by-step instructions for the user to import and build this in their own external tool (FreeCAD, AutoCAD, LTspice, or Fusion360).

Return ONLY a valid JSON object matching this schema:
{
  "mode": "simulation",
  "title": "Virtual Simulation & CAD Lab: [Topic]",
  "objective": "Simulate governing physics and construct a parametric CAD model",
  "theoreticalPrinciple": "Mathematical and physical dynamics simulated in software",
  "difficulty": "Beginner | Intermediate | Advanced",
  "estimatedTime": "30 - 45 minutes",
  "virtualPlatform": "FreeCAD / AutoCAD / Web Interactive Simulator",
  "simulationWorkbench": {
    "engineName": "e.g. Kinematic & Flow Dynamic Emulator",
    "description": "Explains how the simulation responds to live input changes",
    "formulaDisplay": "e.g. V_out = V_in * (R2 / (R1 + R2))",
    "parameters": [
      { "id": "param1", "label": "Primary Variable", "unit": "V", "defaultValue": 12, "min": 0, "max": 24, "step": 1, "description": "Modulates input force or voltage" }
    ],
    "telemetryOutputs": [
      { "id": "out1", "label": "System Efficiency", "unit": "%", "formulaType": "linear", "baseValue": 85 }
    ]
  },
  "cadExports": {
    "freeCadMacro": "# Python script for FreeCAD Part Design\\nimport FreeCAD as App\\nimport Part\\n...",
    "autoCadScript": "; AutoCAD AutoLISP / Command Script\\n(defun c:GenerateModel ()\\n...",
    "openScadOrSpice": "// OpenSCAD or SPICE Netlist\\n...",
    "instructions": "How to paste into FreeCAD Python console or AutoCAD command line"
  },
  "externalSoftwareGuide": {
    "recommendedTool": "FreeCAD (v0.21+) or AutoCAD",
    "steps": [
      {
        "stepNumber": 1,
        "actionTitle": "Initialize Document & Workbench",
        "instruction": "Open FreeCAD, switch to Part Design workbench, and create a Body and Sketch.",
        "softwareFeature": "Part Design -> New Body -> Create Sketch",
        "tip": "Align your base sketch to the XY_Plane for consistent orientation."
      }
    ]
  },
  "troubleshooting": [
    { "symptom": "CAD script syntax error", "cause": "Missing module import or version mismatch", "solution": "Ensure FreeCAD Python console is in Part workbench." }
  ],
  "verificationChallenge": "Parametric test: change the dimension parameter by 50% and verify geometric constraints."
}
`.trim();

const EMPIRICAL_PROMPT = `
You are LearnMate's Scientific Research & Empirical Inquiry Director.
Your mission is to generate a scientific experiment with explicit hypothesis testing, variable isolation, and a structured data-logging protocol.

Return ONLY a valid JSON object matching this schema:
{
  "mode": "experiment",
  "title": "Empirical Investigation: [Topic]",
  "objective": "Hypothesis testing and quantitative validation of theoretical model",
  "theoreticalPrinciple": "The governing scientific law being tested",
  "difficulty": "Beginner | Intermediate | Advanced",
  "estimatedTime": "40 - 50 minutes",
  "hypothesisH0": "Null Hypothesis (H0): Changing [X] produces no statistically significant difference in [Y].",
  "hypothesisH1": "Alternative Hypothesis (H1): Increasing [X] will proportionally increase [Y] according to [Theory].",
  "variableMatrix": {
    "independent": { "name": "e.g. Input Resistance", "unit": "Ohms", "description": "The deliberately modulated variable" },
    "dependent": { "name": "e.g. Measured Voltage Drop", "unit": "Volts", "description": "The measured response" },
    "controlled": ["Ambient temperature (22°C)", "Input rail voltage (5.0V regulated)", "Lead wire gauge"]
  },
  "suggestedTrials": [
    { "trialNumber": 1, "inputVal": 10, "expectedVal": 2.5 },
    { "trialNumber": 2, "inputVal": 20, "expectedVal": 5.0 },
    { "trialNumber": 3, "inputVal": 30, "expectedVal": 7.5 }
  ],
  "errorSources": {
    "systematicErrors": ["Sensor drift", "Lead resistance in probes"],
    "randomErrors": ["Thermal noise", "Parallax in manual meter reading"]
  },
  "analysisRubric": "Instructions on calculating delta, percent deviation, and testing significance.",
  "troubleshooting": [
    { "symptom": "High variance between trials", "cause": "Fluctuating ambient conditions or loose contacts", "solution": "Check shielding and repeat baseline run." }
  ],
  "verificationChallenge": "Calculate whether your measured Pearson correlation r exceeds 0.95."
}
`.trim();

// ==================== FALLBACK GENERATORS ====================

function buildPhysicalFallback(topic: string, components: string[]): PhysicalLabProtocol {
  const parts = components.length > 0 ? components.slice(0, 4) : ['Core Controller', 'Sensor Module', 'Regulator', 'Actuator'];
  return {
    mode: 'hardware',
    title: `Physical Lab: Benchtop Build of ${topic}`,
    objective: `Wire, assemble, and empirically validate the physical hardware channels for ${topic}.`,
    theoreticalPrinciple: `Governs physical electrical, fluid, and mechanical interactions between ${parts.join(', ')}.`,
    difficulty: 'Intermediate',
    estimatedTime: '45 - 60 minutes',
    requiredTools: ['Digital Multimeter', 'Solderless Breadboard & Jumpers', 'DC Bench Power Supply (0-12V)', 'Anti-static Wristband'],
    safetyWarnings: [
      'De-energize main supply before inserting or modifying jumper pin connections.',
      'Wear safety glasses when testing mechanical actuators or pressurized conduits.',
    ],
    physicalBillOfMaterials: parts.map((p, i) => ({
      item: p,
      spec: `Grade Industrial / Bench-grade (Node #${i + 1})`,
      purpose: `Provides active signal or structural handling for ${topic}`,
    })),
    steps: [
      {
        stepNumber: 1,
        title: 'Component Pinout Verification & Workbench Staging',
        instruction: `Stage the key components (${parts.join(', ')}). Measure continuity across the ground rail and verify input voltage polarity before seating onto the breadboard.`,
        safetyOrCaution: 'Verify that power leads are completely disconnected.',
        expectedOutcome: 'Components mounted cleanly with verified pinout orientations.',
      },
      {
        stepNumber: 2,
        title: 'Power Rail Routing & Decoupling',
        instruction: 'Wire the primary VCC and Common Ground rails across the test board. Place a 100nF ceramic decoupling capacitor across each active IC node.',
        safetyOrCaution: 'Avoid polarity reversal on electrolytic capacitors.',
        expectedOutcome: 'Clean rail voltages with ripple below 20mV RMS.',
      },
      {
        stepNumber: 3,
        title: 'Signal & Transducer Interconnection',
        instruction: 'Connect the primary sensing channel to the processing stage using short jumper leads. Keep high-current actuator wires separated from sensitive analog pins.',
        expectedOutcome: 'Continuous continuity path with less than 0.5 Ohm loop resistance.',
      },
      {
        stepNumber: 4,
        title: 'Energization & Step-by-Step Multimeter Probing',
        instruction: 'Power on the bench supply at 50% rated voltage. Probe test points TP1 through TP3 with a multimeter. Slowly increase to full nominal voltage.',
        safetyOrCaution: 'Check for component heating with touch or IR thermometer.',
        expectedOutcome: 'Output signals conform to nominal specifications.',
      },
      {
        stepNumber: 5,
        title: 'Dynamic Stress & Terminal Load Test',
        instruction: 'Subject the assembly to operational load. Measure the temperature rise and signal distortion over a continuous 10-minute runtime.',
        expectedOutcome: 'Stable operation with thermal dissipation within safe limits.',
      },
    ],
    troubleshooting: [
      {
        symptom: 'Zero voltage output across test points',
        cause: 'Tripped bench supply current limit or open ground return',
        solution: 'Check current limiter setting and test continuity along common ground.',
      },
      {
        symptom: 'Excessive signal noise or chatter',
        cause: 'Missing decoupling capacitor or long unshielded jumper wires',
        solution: 'Shorten signal wires and add 10uF filter capacitor near the node input.',
      },
    ],
    verificationChallenge: 'Introduce a 15% input voltage drop and verify if the regulator maintains downstream stability.',
  };
}

function buildVirtualFallback(topic: string, components: string[]): VirtualLabProtocol {
  const compName = components[0] || 'CoreUnit';
  const sanitizedName = compName.replace(/[^a-zA-Z0-9_]/g, '_');

  const freeCadScript = `
# ==========================================================
# FreeCAD Parametric Model Generator: ${topic}
# Paste into the FreeCAD Python Console (View -> Panels -> Python console)
# Compatible with FreeCAD v0.20+ / v0.21+ / v1.0
# ==========================================================
import FreeCAD as App
import Part

# 1. Create or get active document
doc_name = "LearnMate_${sanitizedName}"
if App.getDocument(doc_name):
    App.closeDocument(doc_name)
doc = App.newDocument(doc_name)

# 2. Define Parametric Dimensions (in millimeters)
L = 100.0   # Base Length
W = 60.0    # Base Width
H = 30.0    # Base Height
wall = 3.0  # Shell thickness
hole_r = 4.0 # Mounting hole radius

# 3. Construct Primary Outer Chassis Block
outer_box = Part.makeBox(L, W, H)

# 4. Construct Inner Cavity (Subtractive)
inner_box = Part.makeBox(L - 2*wall, W - 2*wall, H - wall)
inner_box.translate(App.Vector(wall, wall, wall))

# 5. Hollow Out the Enclosure
chassis = outer_box.cut(inner_box)

# 6. Add Parametric Mounting Bosses
for (x, y) in [(10, 10), (L - 10, 10), (10, W - 10), (L - 10, W - 10)]:
    boss = Part.makeCylinder(hole_r + 2.0, H - wall)
    boss.translate(App.Vector(x, y, wall))
    hole = Part.makeCylinder(hole_r, H - wall)
    hole.translate(App.Vector(x, y, wall))
    chassis = chassis.fuse(boss).cut(hole)

# 7. Add Component Housing Pad for ${compName}
component_pad = Part.makeBox(30.0, 25.0, 10.0)
component_pad.translate(App.Vector(L/2 - 15, W/2 - 12.5, wall))
chassis = chassis.fuse(component_pad)

# 8. Render in Document View
part_obj = doc.addObject("Part::Feature", "Chassis_${sanitizedName}")
part_obj.Shape = chassis
doc.recompute()
App.Gui.SendMsgToActiveView("ViewSelection")
print("[LearnMate] Successfully created 3D model for: ${topic}")
`.trim();

  const autoCadScript = `
;; ==========================================================
;; AutoCAD AutoLISP Parametric Generator: ${topic}
;; Paste into the AutoCAD Command Line: (c:LearnMate_${sanitizedName})
;; ==========================================================
(defun c:LearnMate_${sanitizedName} ()
  (setvar "CMDECHO" 0)
  (setq pt1 '(0.0 0.0 0.0))
  (setq len 100.0)
  (setq wid 60.0)
  (setq hgt 30.0)
  
  ;; Draw rectangular boundary
  (command "_RECTANG" pt1 (list len wid 0.0))
  
  ;; Extrude 3D Solid (if in 3D Modeling workspace)
  (command "_EXTRUDE" "_L" "" hgt)
  
  ;; Add 4 mounting holes at corners
  (command "_CYLINDER" '(10.0 10.0 0.0) 4.0 hgt)
  (command "_CYLINDER" (list (- len 10.0) 10.0 0.0) 4.0 hgt)
  (command "_CYLINDER" '(10.0 50.0 0.0) 4.0 hgt)
  (command "_CYLINDER" (list (- len 10.0) (- wid 10.0) 0.0) 4.0 hgt)
  
  (princ "\\n[LearnMate] AutoCAD Geometry Generated for ${topic}.")
  (setvar "CMDECHO" 1)
  (princ)
)
`.trim();

  return {
    mode: 'simulation',
    title: `Virtual Simulator & CAD Workbench: ${topic}`,
    objective: `Test dynamic virtual parameters in-browser and generate 3D CAD models for ${topic} in FreeCAD or AutoCAD.`,
    theoreticalPrinciple: `Simulates dynamic transfer functions and geometric spatial layout for ${topic}.`,
    difficulty: 'Intermediate',
    estimatedTime: '30 - 45 minutes',
    virtualPlatform: 'FreeCAD / AutoCAD / In-Browser Interactive Simulator',
    simulationWorkbench: {
      engineName: `Dynamic Response & Flow Simulator: ${topic}`,
      description: 'Adjust the live sliders below to simulate system behavior, stress response, and output efficiency in real-time.',
      formulaDisplay: 'Output = Input × Efficiency_Factor - Internal_Losses',
      parameters: [
        {
          id: 'inputPower',
          label: 'Input Excitation Level',
          unit: 'W / Force',
          defaultValue: 25,
          min: 5,
          max: 100,
          step: 5,
          description: 'Primary input energy or mechanical driving force applied to the model.',
        },
        {
          id: 'systemDamping',
          label: 'Damping / Resistance',
          unit: 'Ω / N·s/m',
          defaultValue: 10,
          min: 1,
          max: 50,
          step: 1,
          description: 'Internal resistance or thermal dissipation coefficient.',
        },
        {
          id: 'operatingScale',
          label: 'Geometric Scale Ratio',
          unit: '×',
          defaultValue: 1.0,
          min: 0.5,
          max: 2.5,
          step: 0.1,
          description: 'Physical dimension multiplier for structural CAD scaling.',
        },
      ],
      telemetryOutputs: [
        { id: 'throughput', label: 'Dynamic System Output', unit: 'Units/s', formulaType: 'linear', baseValue: 48 },
        { id: 'efficiency', label: 'Calculated Efficiency', unit: '%', formulaType: 'resonant', baseValue: 88 },
        { id: 'thermalRise', label: 'Thermal / Stress Margin', unit: '°C / MPa', formulaType: 'quadratic', baseValue: 34 },
      ],
    },
    cadExports: {
      freeCadMacro: freeCadScript,
      autoCadScript: autoCadScript,
      openScadOrSpice: `// OpenSCAD Parametric Blueprint\n$fn=50;\ndifference() {\n  cube([100, 60, 30], center=false);\n  translate([3, 3, 3]) cube([94, 54, 30], center=false);\n}`,
      instructions: 'Copy the FreeCAD script, open FreeCAD, open the Python Console (View -> Panels -> Python console), paste the code and press Enter.',
    },
    externalSoftwareGuide: {
      recommendedTool: 'FreeCAD (v0.21+) or AutoCAD 2024+',
      steps: [
        {
          stepNumber: 1,
          actionTitle: 'Launch FreeCAD & Open Python Console',
          instruction: 'Start FreeCAD on your computer. Go to top menu: View -> Panels -> Python console.',
          softwareFeature: 'View -> Panels -> Python console',
          tip: 'Ensure FreeCAD has an empty workbench or start page ready.',
        },
        {
          stepNumber: 2,
          actionTitle: 'Execute the Generated Parametric Macro',
          instruction: 'Click the "Copy FreeCAD Script" button above, paste directly into the Python console, and press Enter.',
          softwareFeature: 'Python Interpreter',
          tip: 'The script creates a new document with an accurate parametric housing and mounting holes.',
        },
        {
          stepNumber: 3,
          actionTitle: 'Inspect & Adjust Dimensions',
          instruction: 'In the Model Tree on the left, expand the feature and tweak parameters (L, W, H, hole_r) to match your custom hardware needs.',
          softwareFeature: 'Model Tree -> Properties Panel -> Dimensions',
          tip: 'Press Spacebar on any feature in the tree to toggle 3D visibility.',
        },
        {
          stepNumber: 4,
          actionTitle: 'Export for 3D Printing or CNC Milling',
          instruction: 'Select the created body, go to File -> Export, and choose STL Mesh or STEP with Colors.',
          softwareFeature: 'File -> Export -> STL Mesh (*.stl)',
          tip: 'Use standard STEP format if sharing with mechanical engineers or machinists.',
        },
      ],
    },
    troubleshooting: [
      {
        symptom: 'FreeCAD reports "No module named Part"',
        cause: 'FreeCAD initialized in a specialized workbench where Part was not loaded',
        solution: 'Switch the top workbench dropdown to "Part" or "Part Design" and re-paste.',
      },
      {
        symptom: 'AutoCAD gives "unknown command" error',
        cause: 'Attempted to run 3D Solid extrusion in 2D Drafting workspace',
        solution: 'Switch AutoCAD workspace to "3D Modeling" and re-run.',
      },
    ],
    verificationChallenge: 'In your CAD software, change the mounting hole spacing to 15mm and verify that the perimeter clearance remains above 3mm.',
  };
}

function buildEmpiricalFallback(topic: string, components: string[]): EmpiricalLabProtocol {
  const primaryMetric = components[0] || 'System Response';
  return {
    mode: 'experiment',
    title: `Empirical Investigation & Hypothesis Testing: ${topic}`,
    objective: `Formulate formal null/alternative hypotheses, record multi-trial observational data, and compute deviation for ${topic}.`,
    theoreticalPrinciple: `Validates empirical correlation between input driving parameter and observable output in ${topic}.`,
    difficulty: 'Intermediate',
    estimatedTime: '40 - 50 minutes',
    hypothesisH0: `Null Hypothesis (H0): Modulating the input signal produces no statistically significant change in ${primaryMetric} (p > 0.05).`,
    hypothesisH1: `Alternative Hypothesis (H1): Modulating the input signal produces a predictable, non-random proportional change in ${primaryMetric} conforming to theoretical model.`,
    variableMatrix: {
      independent: {
        name: 'Controlled Stimulus / Input Value',
        unit: 'Input Units (X)',
        description: 'The systematically varied independent parameter across test trials.',
      },
      dependent: {
        name: `${primaryMetric} Output Reading`,
        unit: 'Measured Units (Y)',
        description: 'The empirical response captured by sensor or meter.',
      },
      controlled: [
        'Ambient room temperature (21°C ± 1°C)',
        'Regulated power supply rail voltage (5.00V ± 0.02V)',
        'Observation window and sampling duration (60 seconds per trial)',
      ],
    },
    suggestedTrials: [
      { trialNumber: 1, inputVal: 10, expectedVal: 19.8 },
      { trialNumber: 2, inputVal: 20, expectedVal: 39.5 },
      { trialNumber: 3, inputVal: 30, expectedVal: 59.1 },
      { trialNumber: 4, inputVal: 40, expectedVal: 78.9 },
      { trialNumber: 5, inputVal: 50, expectedVal: 98.4 },
    ],
    errorSources: {
      systematicErrors: [
        'Instrument calibration offset on the primary probe',
        'Lead resistance and internal shunt drop across measurement lines',
      ],
      randomErrors: [
        'Thermal noise and resistor Johnson-Nyquist drift during extended operation',
        'Human parallax error when observing analog gauges',
      ],
    },
    analysisRubric: 'Log your measured values into the table. LearnMate will calculate the Mean, Absolute Delta (|Observed - Theoretical|), and Percentage Error for each trial. If average error < 5%, your data validates H1.',
    troubleshooting: [
      {
        symptom: 'Percentage error exceeds 25% across all trials',
        cause: 'Constant baseline zero offset or wrong measurement unit scale',
        solution: 'Zero and tare your measurement probe, then check unit multipliers (mV vs V).',
      },
      {
        symptom: 'Random non-linear spikes in high-input trials',
        cause: 'Transducer saturation or thermal throttling',
        solution: 'Allow 2 minutes of cooling between trials and verify sensor maximum ratings.',
      },
    ],
    verificationChallenge: 'Plot your recorded values against the expected curve. Calculate if the correlation coefficient R² exceeds 0.95.',
  };
}

// ==================== ROUTE HANDLER ====================

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      workspaceId?: string;
      topic?: string;
      mode?: LabTrackMode;
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

    // Retrieve context from vector store
    let context = '';
    try {
      const chunks = await searchSimilarChunks(topicQuery, workspaceId, 4);
      if (chunks.length > 0) {
        context = chunks.map((c, i) => `[Passage ${i + 1}]\n${c.content}`).join('\n\n---\n\n');
      }
    } catch (searchErr) {
      console.warn('RAG context retrieval skipped for lab guide:', searchErr);
    }

    // Select system prompt based on mode
    let systemPrompt = PHYSICAL_PROMPT;
    if (mode === 'simulation') systemPrompt = VIRTUAL_PROMPT;
    if (mode === 'experiment') systemPrompt = EMPIRICAL_PROMPT;

    // Call AI with structured prompt
    try {
      const userPrompt = `
Topic: ${topicQuery}
Track Mode: ${mode}
Components in Blueprint: ${componentsList.length > 0 ? componentsList.join(', ') : 'Standard laboratory components'}

Lecture & Document Context:
${context || 'No specific textbook passages retrieved; generate a sound multidisciplinary lab protocol based on scientific principles.'}

Create a rigorous, highly specialized ${mode.toUpperCase()} protocol for this topic.
`.trim();

      const { content: aiResponse, provider: providerUsed } = await callAiWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        complexity: 'complex',
        cacheKey: contentCacheKey(`lab_v2:${workspaceId}:${mode}`, userPrompt),
      });

      const cleaned = aiResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // Find outer JSON object boundaries if model prepended thoughts or text
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonCandidate =
        firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;

      const parsed = JSON.parse(jsonCandidate) as HandsOnLabProtocol;

      if (parsed && typeof parsed.title === 'string' && parsed.mode === mode) {
        return NextResponse.json({ success: true, providerUsed, lab: parsed });
      }
    } catch (aiErr) {
      console.warn('AI lab generation failed or timed out, using specialized fallback synthesizer:', aiErr);
    }

    // High quality specialized fallback for each track
    let fallback: HandsOnLabProtocol;
    if (mode === 'simulation') {
      fallback = buildVirtualFallback(topicQuery, componentsList);
    } else if (mode === 'experiment') {
      fallback = buildEmpiricalFallback(topicQuery, componentsList);
    } else {
      fallback = buildPhysicalFallback(topicQuery, componentsList);
    }

    return NextResponse.json({ success: true, providerUsed: 'fallback', lab: fallback });
  } catch (error: unknown) {
    console.error('Hands-on Lab API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate hands-on lab protocol.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
