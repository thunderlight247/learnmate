// Phase 2 processing pipeline: PDF upload -> text extraction -> chunking
// -> embeddings -> pgvector storage. Creates the Document row, runs every
// stage, and tracks PENDING/PROCESSING/COMPLETED/ERROR so the UI can show
// document state.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractTextFromPdf, chunkText } from '@/lib/document-processor';
import { saveDocumentChunks } from '@/lib/embeddings';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/upload-limits';

// Embedding a large document means one OpenRouter call per chunk; allow
// up to 5 minutes on platforms that honor this route segment config.
export const maxDuration = 300;

export async function POST(request: Request) {
  let documentId: string | null = null;

  try {
    const formData = await request.formData();

    const file = formData.get('file');
    const workspaceId = formData.get('workspaceId');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Please upload a lecture PDF first.' },
        { status: 400 },
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Please upload a valid PDF file.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `The PDF must be ${MAX_FILE_SIZE_MB} MB or smaller.` },
        { status: 400 },
      );
    }

    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      return NextResponse.json(
        { error: 'A workspaceId is required to process a document.' },
        { status: 400 },
      );
    }

    // TODO(Phase 3): store the file in blob storage and persist the real URL.
    // fileUrl is a required column, so an empty string is used until then.
    const document = await prisma.document.create({
      data: {
        workspaceId,
        fileName: file.name,
        fileUrl: '',
        status: 'PROCESSING',
      },
    });
    documentId = document.id;

    const buffer = Buffer.from(await file.arrayBuffer());

    const text = await extractTextFromPdf(buffer);

    if (!text.trim()) {
      throw new Error(
        "We couldn't find readable text in this document. Scanned PDFs need OCR before processing.",
      );
    }

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('The document produced no text chunks to embed.');
    }

    const chunkCount = await saveDocumentChunks(documentId, chunks);

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'COMPLETED' },
    });

    return NextResponse.json({
      success: true,
      documentId,
      chunkCount,
    });
  } catch (error: unknown) {
    console.error('Document Processing Error:', error);

    // Only mark ERROR if the Document row was actually created; earlier
    // failures (validation, formData parsing) have nothing to update.
    if (documentId) {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'ERROR' },
        });
      } catch (updateError) {
        console.error(
          'Failed to mark document as ERROR:',
          updateError,
        );
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : 'We could not process the document. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
