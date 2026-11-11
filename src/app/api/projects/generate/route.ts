// Phase 5: theory-to-project blueprint generator (HTTP layer).
// All retrieval, AI, and persistence logic lives in src/lib/blueprint.ts so
// the end-to-end verification script can exercise the exact same code path.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateBlueprint } from '@/lib/blueprint';
import { extractCustomAiConfig } from '@/lib/aiClient';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceId?: unknown;
      topic?: unknown;
    };

    if (typeof body.workspaceId !== 'string' || !body.workspaceId.trim()) {
      return NextResponse.json(
        { error: 'A workspaceId is required to generate a blueprint.' },
        { status: 400 },
      );
    }

    if (typeof body.topic !== 'string' || !body.topic.trim()) {
      return NextResponse.json(
        { error: 'A topic is required to generate a blueprint.' },
        { status: 400 },
      );
    }

    const project = await generateBlueprint(
      body.workspaceId,
      body.topic.trim(),
      prisma,
      extractCustomAiConfig(request),
    );

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: unknown) {
    console.error('Blueprint Generation Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate the project blueprint. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
