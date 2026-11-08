import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

interface Progress {
  version: 1;
  nodes: Array<{ id: string; x: number; y: number }>;
  edges: Array<{ source: string; target: string }>;
}

function validateProgress(value: unknown, validNodeIds: Set<string>): value is Progress {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.nodes.length > validNodeIds.size || data.edges.length > 1000) return false;
  const ids = new Set<string>();
  for (const value of data.nodes) {
    if (!value || typeof value !== 'object') return false;
    const node = value as Record<string, unknown>;
    if (typeof node.id !== 'string' || !validNodeIds.has(node.id) || ids.has(node.id) || typeof node.x !== 'number' || !Number.isFinite(node.x) || Math.abs(node.x) > 1_000_000 || typeof node.y !== 'number' || !Number.isFinite(node.y) || Math.abs(node.y) > 1_000_000) return false;
    ids.add(node.id);
  }
  const pairs = new Set<string>();
  for (const value of data.edges) {
    if (!value || typeof value !== 'object') return false;
    const edge = value as Record<string, unknown>;
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) return false;
    const pair = JSON.stringify([edge.source, edge.target]);
    if (pairs.has(pair)) return false;
    pairs.add(pair);
  }
  return true;
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'A projectId is required.' }, { status: 400 });
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { assemblyProgress: true, assemblyRevision: true } });
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ progress: project.assemblyProgress, revision: project.assemblyRevision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Assembly load error:', error);
    return NextResponse.json({ error: 'Could not load assembly progress.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { projectId?: unknown; revision?: unknown; progress?: unknown };
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0) {
      return NextResponse.json({ error: 'A projectId and valid revision are required.' }, { status: 400 });
    }
    const project = await prisma.project.findUnique({ where: { id: body.projectId }, select: { nodes: { select: { id: true } } } });
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (!validateProgress(body.progress, new Set(project.nodes.map((node) => node.id)))) {
      return NextResponse.json({ error: 'Invalid assembly progress.' }, { status: 400 });
    }
    const result = await prisma.project.updateMany({
      where: { id: body.projectId, assemblyRevision: body.revision },
      data: { assemblyProgress: body.progress as unknown as Prisma.InputJsonValue, assemblyRevision: { increment: 1 } },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Assembly changed on another device. Reload to see the latest version.' }, { status: 409 });
    return NextResponse.json({ revision: body.revision + 1 });
  } catch (error) {
    console.error('Assembly save error:', error);
    return NextResponse.json({ error: 'Could not save assembly progress.' }, { status: 500 });
  }
}
