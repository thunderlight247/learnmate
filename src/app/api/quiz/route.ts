import { NextResponse } from 'next/server';
import { callAiWithFallback } from '@/lib/aiClient';

// Quiz route contract: expects { context } in JSON and returns a quiz payload in the UI shape.
// The model is instructed to return strict JSON so the frontend can parse it safely.
export async function POST(request: Request) {
  try {
    const { context } = await request.json();

    if (!context) {
      return NextResponse.json(
        { error: 'Document context is required to generate a quiz.' },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are LearnMate, an expert exam creator.
Generate a 5-question multiple choice quiz based strictly on the provided lecture context.

Return ONLY valid JSON matching this exact structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Explanation of why Option A is correct."
    }
  ]
}
`.trim();

    // Generate a fresh quiz each time; validate before returning it.
    const { content: aiResponse, provider: providerUsed } = await callAiWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate a 5-question multiple choice quiz based on this lecture context:\n\n${context}`,
        },
      ],
      complexity: 'simple',

    });

    const cleanedResponse = aiResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed: unknown = JSON.parse(cleanedResponse);
    const questions = (parsed as { questions?: unknown })?.questions;
    if (!Array.isArray(questions) || questions.length !== 5 || !questions.every((q: unknown) => {
      if (!q || typeof q !== 'object') return false;
      const item = q as Record<string, unknown>;
      return typeof item.question === 'string' && Array.isArray(item.options) &&
        item.options.length === 4 && item.options.every((option: unknown) => typeof option === 'string') &&
        typeof item.correctAnswerIndex === 'number' && Number.isInteger(item.correctAnswerIndex) &&
        item.correctAnswerIndex >= 0 && item.correctAnswerIndex < 4 && typeof item.explanation === 'string';
    })) {
      throw new Error('The AI returned an invalid quiz. Please try again.');
    }

    return NextResponse.json({ quiz: questions, providerUsed });
  } catch (error: unknown) {
    console.error('Quiz API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate quiz.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}