import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';

// Chat route contract: expects { question, context } in JSON.
// The context is the extracted lecture text that the AI should answer from without inventing details.
export async function POST(request: Request) {
  try {
    const { question, context } = await request.json();

    if (!question || !context) {
      return NextResponse.json(
        { error: 'Question and document context are required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are LearnMate, an expert academic tutor.
Answer the user's question clearly and accurately based strictly on the provided lecture material below.
If the answer cannot be found in the material, mention that it's not explicitly in the text, but provide a brief helpful answer.

Document Context:
${context}
`.trim();

    const answer = await callOpenRouter(systemPrompt, question);

    return NextResponse.json({ answer });
  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process question.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}