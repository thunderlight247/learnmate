import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';

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

    const aiResponse = await callOpenRouter(
      systemPrompt, 
      `Generate a 5-question multiple choice quiz based on this lecture context:\n\n${context}`
    );

    const cleanedResponse = aiResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanedResponse);

    return NextResponse.json({ quiz: parsed.questions });
  } catch (error: unknown) {
    console.error('Quiz API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate quiz.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}