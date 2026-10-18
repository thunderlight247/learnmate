// Phase 4: AI flashcard generation. Picks chunks from the workspace's most
// recently processed documents, asks OpenRouter for a strict-JSON flashcard
// set grounded in that material, and persists each card with fresh SM-2
// scheduling state (repetitions 0, easeFactor 2.5, due immediately).

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAiWithFallback } from '@/lib/aiClient';

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;

// Context budget: chunks from up to 3 recent documents, capped so the
// prompt stays well within the chat model's context window.
const MAX_DOCUMENTS = 3;
const MAX_CHUNKS_PER_DOCUMENT = 12;

const DOCUMENT_CHUNK_LIMIT = MAX_DOCUMENTS * MAX_CHUNKS_PER_DOCUMENT;

interface GeneratedFlashcard {
  front: string;
  back: string;
}

const systemPrompt = `
You are LearnMate, an expert academic study assistant.

Create flashcards from the lecture material provided below.

Return ONLY valid JSON. Do not use Markdown code fences.

The JSON must exactly follow this structure:

{
  "flashcards": [
    { "front": "Question or prompt", "back": "Answer" }
  ]
}

Rules:
1. Base every flashcard strictly on the provided material.
2. One fact or concept per card; keep cards atomic.
3. Fronts should be clear questions, terms, or prompts.
4. Backs should be concise, accurate answers.
5. Do not invent material that is not supported by the context.
`.trim();

async function loadWorkspaceContext(workspaceId: string): Promise<string> {
  const documents = await prisma.document.findMany({
    where: { workspaceId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    take: MAX_DOCUMENTS,
    select: { id: true, fileName: true },
  });

  if (documents.length === 0) return '';

  const chunks = await prisma.documentChunk.findMany({
    where: { documentId: { in: documents.map((document) => document.id) } },
    take: DOCUMENT_CHUNK_LIMIT,
    select: { content: true, document: { select: { fileName: true } } },
  });

  return chunks
    .map((chunk) => `[source: ${chunk.document.fileName}]\n${chunk.content}`)
    .join('\n\n---\n\n');
}

function parseFlashcards(raw: string): GeneratedFlashcard[] {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed: unknown = JSON.parse(cleaned);

  const cards = (parsed as { flashcards?: unknown }).flashcards;

  if (!Array.isArray(cards)) {
    throw new Error('AI response is missing the "flashcards" array.');
  }

  return cards.map((card) => {
    if (
      typeof card !== 'object' ||
      card === null ||
      typeof (card as GeneratedFlashcard).front !== 'string' ||
      typeof (card as GeneratedFlashcard).back !== 'string'
    ) {
      throw new Error('AI returned a flashcard with an invalid shape.');
    }
    return card as GeneratedFlashcard;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: unknown;
      count?: unknown;
    };

    if (typeof body.workspaceId !== 'string' || !body.workspaceId.trim()) {
      return NextResponse.json(
        { error: 'A workspaceId is required to generate flashcards.' },
        { status: 400 },
      );
    }

    const requestedCount =
      body.count === undefined ? DEFAULT_COUNT : Number(body.count);

    if (
      !Number.isInteger(requestedCount) ||
      requestedCount < 1 ||
      requestedCount > MAX_COUNT
    ) {
      return NextResponse.json(
        { error: `count must be an integer between 1 and ${MAX_COUNT}.` },
        { status: 400 },
      );
    }

    const context = await loadWorkspaceContext(body.workspaceId);

    if (!context.trim()) {
      return NextResponse.json(
        {
          error:
            'No processed documents found in this workspace. Upload and process a PDF first.',
        },
        { status: 400 },
      );
    }

    // Flashcards are a lightweight structured task: route on the fast/cheap
    // model tier. Deliberately NOT cached — every generation creates fresh
    // Flashcard rows, so a cached payload would silently duplicate cards.
    const { content: aiResponse, provider: providerUsed } = await callAiWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate exactly ${requestedCount} flashcards from this lecture material:\n\n${context}`,
        },
      ],
      complexity: 'simple',
    });

    let flashcards: GeneratedFlashcard[];

    try {
      flashcards = parseFlashcards(aiResponse);
    } catch (parseError) {
      console.error('Invalid flashcard JSON from AI:', aiResponse, parseError);
      return NextResponse.json(
        { error: 'The AI returned an invalid flashcard set. Please try again.' },
        { status: 502 },
      );
    }

    // Schema defaults provide the fresh SM-2 state: repetitions 0,
    // interval 0, easeFactor 2.5, dueDate now (reviewable immediately).
    const created: Awaited<ReturnType<typeof prisma.flashcard.create>>[] = [];
    for (const card of flashcards) {
      created.push(
        await prisma.flashcard.create({
          data: {
            workspaceId: body.workspaceId,
            front: card.front,
            back: card.back,
          },
        }),
      );
    }

    return NextResponse.json({
      success: true,
      providerUsed,
      flashcards: created,
      count: created.length,
    });
  } catch (error: unknown) {
    console.error('Flashcard Generation Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate flashcards. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
