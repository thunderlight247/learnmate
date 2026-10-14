// Phase 4: flashcard review endpoint. Applies one SM-2 review to a card's
// scheduling state and persists the new repetitions/interval/easeFactor/
// dueDate. The algorithm itself lives in src/lib/sm2.ts (pure functions).

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSM2 } from '@/lib/sm2';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      flashcardId?: unknown;
      quality?: unknown;
    };

    if (
      typeof body.flashcardId !== 'string' ||
      !body.flashcardId.trim()
    ) {
      return NextResponse.json(
        { error: 'A flashcardId is required.' },
        { status: 400 },
      );
    }

    if (
      typeof body.quality !== 'number' ||
      !Number.isInteger(body.quality) ||
      body.quality < 0 ||
      body.quality > 5
    ) {
      return NextResponse.json(
        { error: 'quality must be an integer between 0 and 5.' },
        { status: 400 },
      );
    }

    const flashcard = await prisma.flashcard.findUnique({
      where: { id: body.flashcardId },
    });

    if (!flashcard) {
      return NextResponse.json(
        { error: 'Flashcard not found.' },
        { status: 404 },
      );
    }

    const result = calculateSM2(
      body.quality,
      flashcard.repetitions,
      flashcard.easeFactor,
      flashcard.interval,
    );

    const updated = await prisma.flashcard.update({
      where: { id: flashcard.id },
      data: {
        repetitions: result.repetitions,
        interval: result.interval,
        easeFactor: result.easeFactor,
        dueDate: result.dueDate,
      },
    });

    return NextResponse.json({ success: true, flashcard: updated });
  } catch (error: unknown) {
    console.error('Flashcard Review Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to review the flashcard. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
