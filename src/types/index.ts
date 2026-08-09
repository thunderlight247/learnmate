// Shared frontend types for the document analysis and quiz data used across the dashboard.
export interface DocumentAnalysis {
  summary: string;
  keyConcepts: string[];
  importantTopics: string[];
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface AppState {
  rawText: string | null;
  analysis: DocumentAnalysis | null;
  isProcessing: boolean;
  error: string | null;
}