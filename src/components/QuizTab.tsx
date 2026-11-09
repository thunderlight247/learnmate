'use client';

// Quiz generator panel. It asks the backend for a JSON-based multiple-choice quiz derived from the document text.
import { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, HelpCircle, RefreshCw } from 'lucide-react';

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface QuizTabProps {
  rawText: string | null;
}

export default function QuizTab({ rawText }: QuizTabProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuiz = async () => {
    if (!rawText) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setSelectedAnswers({});
    setQuestions(null);

    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: rawText }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to generate quiz');

      setQuestions(data.quiz);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionIndex: number, optionIndex: number) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const calculateScore = () => {
    if (!questions) return 0;
    return questions.reduce((score, q, idx) => {
      return selectedAnswers[idx] === q.correctAnswerIndex ? score + 1 : score;
    }, 0);
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin"/>
        <p className="text-gray-600 font-medium">Creating your custom practice quiz...</p>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
        <HelpCircle className="h-16 w-16 text-blue-500 opacity-60"/>
        <h3 className="text-lg font-bold text-gray-800">Test Your Knowledge</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Generate an AI practice quiz based on the key concepts in your document.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={generateQuiz}
          disabled={!rawText}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
        >
          Generate Practice Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="text-lg font-bold">Practice Quiz</h2>
          <p className="text-xs text-gray-500">5 questions from your lecture material</p>
        </div>
        <button
          onClick={generateQuiz}
          className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5"/>
          <span>New Quiz</span>
        </button>
      </div>

      {questions.map((q, qIdx) => {
        return (
          <div key={q.id || qIdx} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <p className="font-semibold text-sm text-gray-800">
              {qIdx + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, optIdx) => {
                const isSelected = selectedAnswers[qIdx] === optIdx;
                const isCorrect = q.correctAnswerIndex === optIdx;

                let optionStyle = 'bg-white border-gray-200 text-gray-700 hover:border-blue-300';
                if (isSelected) optionStyle = 'bg-blue-50 border-blue-500 text-blue-900 font-medium';

                if (submitted) {
                  if (isCorrect) optionStyle = 'bg-green-50 border-green-500 text-green-900 font-medium';
                  else if (isSelected) optionStyle = 'bg-red-50 border-red-500 text-red-900';
                }

                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectOption(qIdx, optIdx)}
                    disabled={submitted}
                    className={`w-full text-left p-3 rounded-md border text-xs transition-colors flex items-center justify-between ${optionStyle}`}
                  >
                    <span>{opt}</span>
                    {submitted && isCorrect && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0"/>}
                    {submitted && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-red-600 shrink-0"/>}
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 mt-2">
                <span className="font-bold">Explanation: </span>
                {q.explanation}
              </div>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          disabled={Object.keys(selectedAnswers).length < questions.length}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
        >
          Submit Answers
        </button>
      ) : (
        <div className="bg-gray-100 p-4 rounded-lg text-center space-y-2 border border-gray-200">
          <p className="font-bold text-gray-800 text-base">
            Your Score: {calculateScore()} / {questions.length}
          </p>
          <button
            onClick={generateQuiz}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium text-xs hover:bg-blue-700"
          >
            Try Another Quiz
          </button>
        </div>
      )}
    </div>
  );
}