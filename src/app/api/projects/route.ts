// Phase 6: Project retrieval API.
// Fetches all projects in a workspace, including nodes and edges, so that
// students can view previously generated blueprints on the canvas.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'A workspaceId query parameter is required.' },
        { status: 400 },
      );
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId },
      include: {
        nodes: true,
        edges: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error: unknown) {
    console.error('List Projects Error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to retrieve projects.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
