// Phase 6 & Next-Gen: Project retrieval and deletion API.
// Fetches all projects in a workspace (or across recent workspaces),
// including nodes, edges, and BOM, so learners can manage their Project Library.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const projectId = searchParams.get('projectId');

    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, include: { nodes: true, edges: true } });
      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      return NextResponse.json({ success: true, project });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'A workspaceId is required.' }, { status: 400 });
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId },
      include: {
        nodes: true,
        edges: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error: unknown) {
    console.error('List Projects Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to retrieve projects.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let projectId = searchParams.get('projectId');

    if (!projectId) {
      try {
        const body = (await request.json()) as { projectId?: string };
        projectId = body.projectId || null;
      } catch {
        // body wasn't JSON
      }
    }

    if (!projectId) {
      return NextResponse.json(
        { error: 'A projectId is required to delete a project.' },
        { status: 400 },
      );
    }

    // Cascade delete is defined in schema (CanvasNode and CanvasEdge will be deleted)
    await prisma.project.delete({
      where: { id: projectId },
    });

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully.',
    });
  } catch (error: unknown) {
    console.error('Delete Project Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete project.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
