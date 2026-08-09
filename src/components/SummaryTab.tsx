'use client';

// Shows the AI-generated summary and the extracted key concepts for the uploaded lecture.
import type { DocumentAnalysis } from '@/types';

interface SummaryTabProps {
  analysis: DocumentAnalysis | null;
  isProcessing: boolean;
}

export default function SummaryTab({
  analysis,
  isProcessing,
}: SummaryTabProps) {
  if (isProcessing) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Analyzing Document
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Extracting and understanding your lecture material...
          </p>
        </div>

        <div className="space-y-3">
          <div className="h-5 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-5 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-5 bg-gray-100 rounded animate-pulse w-5/6" />
        </div>

        <div className="space-y-3 pt-4">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-1/3" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>Your document summary will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">
          Document Summary
        </h2>

        <p className="text-gray-700 leading-7">
          {analysis.summary}
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-3 text-gray-900 border-b border-gray-200 pb-2">
          Key Concepts
        </h3>

        {analysis.keyConcepts?.length > 0 ? (
          <ul className="space-y-3">
            {analysis.keyConcepts.map((concept, index) => (
              <li
                key={`${concept}-${index}`}
                className="flex items-start"
              >
                <span className="text-blue-600 mr-2 font-bold">
                  •
                </span>

                <span className="text-gray-700">
                  {concept}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No key concepts were identified.
          </p>
        )}
      </div>

      {analysis.importantTopics?.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wider mb-3">
            Important Topics
          </h3>

          <div className="flex flex-wrap gap-2">
            {analysis.importantTopics.map((topic, index) => (
              <span
                key={`${topic}-${index}`}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-full border border-gray-200"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}