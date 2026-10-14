// Phase 6: Canvas coordinate persistence.
// Updates (positionX, positionY) for one or more CanvasNode records
// so that manual node dragging and auto-layout remain persistent.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface NodeCoordinateUpdate {
  id: string;
  positionX: number;
  positionY: number;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      nodes?: unknown;
    };

    if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
      return NextResponse.json(
        { error: 'An array of nodes with id, positionX, and positionY is required.' },
        { status: 400 },
      );
    }

    const updates: NodeCoordinateUpdate[] = [];

    for (const item of body.nodes) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as NodeCoordinateUpdate).id === 'string' &&
        typeof (item as NodeCoordinateUpdate).positionX === 'number' &&
        typeof (item as NodeCoordinateUpdate).positionY === 'number'
      ) {
        updates.push({
          id: (item as NodeCoordinateUpdate).id,
          positionX: (item as NodeCoordinateUpdate).positionX,
          positionY: (item as NodeCoordinateUpdate).positionY,
        });
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No valid node coordinate updates found in request.' },
        { status: 400 },
      );
    }

    // Transactionally update all node coordinates
    await prisma.$transaction(
      updates.map((node) =>
        prisma.canvasNode.update({
          where: { id: node.id },
          data: {
            positionX: node.positionX,
            positionY: node.positionY,
          },
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      updated: updates.length,
    });
  } catch (error: unknown) {
    console.error('Save Node Coordinates Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to save node coordinates.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
