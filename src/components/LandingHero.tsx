'use client';

import { BookOpen } from 'lucide-react';

export default function LandingHero() {
  return (
    <div className="bg-white py-24 sm:py-32 flex flex-col items-center justify-center text-center px-6">
      <div className="flex items-center space-x-3 mb-6">
        <BookOpen className="h-12 w-12 text-blue-600" />
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          LearnMate
        </h1>
      </div>
      <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl">
        Upload your complex lecture materials and let our AI tutor instantly generate summaries, explain difficult concepts, and build interactive practice quizzes.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <a
          href="/app"
          className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          Start Learning Now
        </a>
      </div>
    </div>
  );
}