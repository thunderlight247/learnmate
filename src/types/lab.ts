// Type definitions for the multi-track Hands-On Laboratory Studio:
// 1. Physical Lab (hardware bench assembly, physical BOM, wiring, multimeter checks)
// 2. Virtual Lab (interactive in-browser parameter simulator, FreeCAD Python macro, AutoCAD script, external CAD guide)
// 3. Empirical Lab (null/alternative hypothesis, variable controls, interactive data logging table, error analysis)

export type LabTrackMode = 'hardware' | 'simulation' | 'experiment';

export interface BaseLabStep {
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

// 🛠️ PHYSICAL LAB SPEC
export interface PhysicalBOMItem {
  item: string;
  spec: string;
  purpose: string;
}

export interface PhysicalLabProtocol {
  mode: 'hardware';
  title: string;
  objective: string;
  theoreticalPrinciple: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  requiredTools: string[];
  safetyWarnings: string[];
  physicalBillOfMaterials: PhysicalBOMItem[];
  steps: BaseLabStep[];
  troubleshooting: LabTroubleshooting[];
  verificationChallenge: string;
}

// 💻 VIRTUAL LAB SPEC
export interface SimParameter {
  id: string;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  description: string;
}

export interface SimTelemetryOutput {
  id: string;
  label: string;
  unit: string;
  // Coefficient or formula multiplier relative to input parameters for the client simulator
  formulaType: 'linear' | 'inverse' | 'quadratic' | 'exponential' | 'resonant';
  baseValue: number;
}

export interface CadExports {
  freeCadMacro: string;
  autoCadScript: string;
  openScadOrSpice: string;
  instructions: string;
}

export interface ExternalSoftwareStep {
  stepNumber: number;
  actionTitle: string;
  instruction: string;
  softwareFeature: string;
  tip?: string;
}

export interface VirtualLabProtocol {
  mode: 'simulation';
  title: string;
  objective: string;
  theoreticalPrinciple: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  virtualPlatform: string;
  simulationWorkbench: {
    engineName: string;
    description: string;
    parameters: SimParameter[];
    telemetryOutputs: SimTelemetryOutput[];
    formulaDisplay: string;
  };
  cadExports: CadExports;
  externalSoftwareGuide: {
    recommendedTool: string;
    steps: ExternalSoftwareStep[];
  };
  troubleshooting: LabTroubleshooting[];
  verificationChallenge: string;
}

// 🔬 EMPIRICAL LAB SPEC
export interface VariableDefinition {
  name: string;
  unit: string;
  description: string;
}

export interface EmpiricalVariableMatrix {
  independent: VariableDefinition;
  dependent: VariableDefinition;
  controlled: string[];
}

export interface DataLoggerRow {
  trialNumber: number;
  inputVal: number;
  expectedVal: number;
}

export interface EmpiricalLabProtocol {
  mode: 'experiment';
  title: string;
  objective: string;
  theoreticalPrinciple: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  hypothesisH0: string; // Null Hypothesis
  hypothesisH1: string; // Alternative Hypothesis
  variableMatrix: EmpiricalVariableMatrix;
  suggestedTrials: DataLoggerRow[];
  errorSources: {
    systematicErrors: string[];
    randomErrors: string[];
  };
  analysisRubric: string;
  troubleshooting: LabTroubleshooting[];
  verificationChallenge: string;
}

export type HandsOnLabProtocol =
  | PhysicalLabProtocol
  | VirtualLabProtocol
  | EmpiricalLabProtocol;
