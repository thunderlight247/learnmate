// Workspace bootstrap for the UI pipeline: the client needs a workspaceId
// before POST /api/documents/process will accept an upload. There is no
// auth layer yet, so every caller shares the singleton demo user — the same
// convention verify-phases.ts uses.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DEMO_USER_EMAIL = 'demo@learnmate.local';

export async function POST() {
  try {
    // Singleton user, created on demand. email is unique, so a concurrent
    // first call would 409 on create; upsert makes the route idempotent.
    const user = await prisma.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: {},
      create: { email: DEMO_USER_EMAIL, name: 'Demo Student' },
    });

    // A fresh workspace prevents a new document from inheriting old chunks.
    // This does not replace authentication or authorize access to the data.
    const active = await prisma.workspace.create({
      data: { userId: user.id, name: 'My Study Workspace' },
    });

    return NextResponse.json({
      success: true,
      workspaceId: active.id,
    });
  } catch (error: unknown) {
    console.error('Workspace Bootstrap Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Could not create a workspace. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
