'use client';

// Shows the AI-generated summary, extracted key concepts, and important topics
// for the uploaded lecture. Each concept and topic can be turned into an
// interactive 2D hands-on project blueprint via the "Build a Project" action.
import { FlaskConical } from 'lucide-react';
import type { DocumentAnalysis } from '@/types';

interface SummaryTabProps {
  analysis: DocumentAnalysis | null;
  isProcessing: boolean;
  onBuildProject?: (topic: string) => void;
}

export default function SummaryTab({
  analysis,
  isProcessing,
  onBuildProject,
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
                className="flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start flex-1 min-w-0">
                  <span className="text-blue-600 mr-2 font-bold shrink-0">
                    •
                  </span>
                  <span className="text-gray-700">
                    {concept}
                  </span>
                </div>

                {onBuildProject && (
                  <button
                    type="button"
                    onClick={() => onBuildProject(concept)}
                    className="shrink-0 flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-100 hover:border-indigo-300"
                    title={`Generate a hands-on project for "${concept}"`}
                  >
                    <FlaskConical className="h-3 w-3" />
                    Build Project
                  </button>
                )}
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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border ${
                  onBuildProject
                    ? 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-800 cursor-pointer transition-colors'
                    : 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
                role={onBuildProject ? 'button' : undefined}
                onClick={onBuildProject ? () => onBuildProject(topic) : undefined}
              >
                {topic}
                {onBuildProject && (
                  <FlaskConical className="h-3 w-3 text-indigo-500 opacity-60" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA Banner when build is available */}
      {onBuildProject && (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-indigo-950">
                Turn any concept into a hands-on project
              </h4>
              <p className="mt-0.5 text-xs text-indigo-800/80 leading-relaxed">
                Hover over any key concept above and click <strong>Build Project</strong> to instantly
                generate an interactive 2D system blueprint, component inspector, and step-by-step
                lab protocol you can follow to build it in the real world.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}