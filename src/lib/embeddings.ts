// Vector embedding utilities for the RAG pipeline.
// Generates embeddings via the OpenRouter embeddings API and persists
// document chunks (with their pgvector embeddings) through Prisma raw SQL,
// since Prisma's typed client cannot write the unsupported `vector(1536)`
// column type directly.

import { prisma } from '@/lib/prisma';

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

// OpenRouter namespaces provider models, so the id includes the `openai/`
// prefix (the bare `text-embedding-3-small` id is not resolvable there).
// Its output dimensionality matches the schema's vector(1536) column.
const EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface OpenRouterEmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

/**
 * Generates a vector embedding for a single piece of text using the
 * OpenRouter embeddings API.
 *
 * @param text - The text to embed. Must be non-empty.
 * @returns The embedding vector (1536 dimensions for
 * `openai/text-embedding-3-small`).
 * @throws Error if the API key is missing, the request fails, or the
 * response contains no usable embedding.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error('Cannot generate an embedding for empty text.');
  }

  const rawApiKey = process.env.OPENROUTER_API_KEY;

  if (!rawApiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is missing from environment variables.',
    );
  }

  // Strip accidental quotes or surrounding whitespace, mirroring
  // the chat-completion helper in openrouter.ts.
  const apiKey = rawApiKey.replace(/['"]/g, '').trim();

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'LearnMate',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter embeddings API error: ${errorData}`);
  }

  const data = (await response.json()) as OpenRouterEmbeddingResponse;
  const embedding = data.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('OpenRouter embeddings API returned no usable embedding.');
  }

  // Fail fast with a clear message if dimensions drift from the
  // vector(1536) column instead of an obscure insert error later.
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensionality: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}.`,
    );
  }

  return embedding;
}

/**
 * Ensures an HNSW index exists on `DocumentChunk.embedding` for fast
 * approximate nearest-neighbor search with cosine distance (`<=>`).
 *
 * Requires pgvector >= 0.5.0. Safe to call repeatedly: the statement is
 * `IF NOT EXISTS` and the result is memoized per process. Index creation
 * failure is logged but never fatal — search still works via sequential
 * scan without it.
 */
let vectorIndexReady = false;

export async function ensureVectorIndex(): Promise<void> {
  if (vectorIndexReady) return;

  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS document_chunk_embedding_idx
       ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops)`,
    );
    vectorIndexReady = true;
  } catch (error) {
    console.error('Failed to create HNSW vector index:', error);
  }
}

/**
 * Generates an embedding for every chunk and inserts each chunk (with its
 * pgvector embedding) into the `DocumentChunk` table.
 *
 * Prisma's typed client cannot write `Unsupported("vector(1536)")` columns,
 * so inserts go through raw SQL. `gen_random_uuid()` (core in Postgres 13+)
 * supplies the id because the model's cuid() default is not applied to raw
 * statements.
 *
 * Chunks are embedded sequentially to keep request order stable and stay
 * friendly to API rate limits.
 *
 * @param documentId - Id of the parent Document row (FK enforced by the DB).
 * @param chunks - Ordered text chunks, e.g. from `chunkText()`.
 * @returns The number of chunks inserted.
 * @throws Error if embedding generation or any insert fails; previously
 * inserted chunks are kept (no transactional rollback).
 */
export async function saveDocumentChunks(
  documentId: string,
  chunks: string[],
): Promise<number> {
  if (chunks.length === 0) return 0;

  let inserted = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];

    if (!chunk.trim()) continue;

    const embedding = await generateEmbedding(chunk);

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
         VALUES (gen_random_uuid(), $1, $2, $3::vector)`,
        documentId,
        chunk,
        toPgVectorLiteral(embedding),
      );
      inserted += 1;
    } catch (error) {
      console.error(`Failed to insert chunk ${i + 1}/${chunks.length}:`, error);
      throw new Error(
        `Failed to save document chunk ${i + 1} of ${chunks.length}.`,
      );
    }
  }

  // Keep the HNSW vector index in place so similarity search stays fast
  // as the chunk table grows. Non-fatal if it fails (see docstring).
  await ensureVectorIndex();

  return inserted;
}

/**
 * Serializes an embedding vector into pgvector's text format, e.g.
 * `[0.011,-0.123,...]`, for insertion with the `$3::vector` cast.
 */
function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/** A DocumentChunk row returned by the similarity search. */
export interface SimilarChunk {
  id: string;
  documentId: string;
  content: string;
  /** Cosine similarity in [0, 1]; 1 means identical direction. */
  similarity: number;
}

/**
 * Finds the document chunks in a workspace that are semantically closest
 * to the query, using pgvector's cosine-distance operator (`<=>`).
 *
 * Prisma's typed client cannot query `Unsupported("vector(1536)")`
 * columns, so the search runs through raw SQL with the vector passed in
 * pgvector's text format.
 *
 * @param query - The natural-language search query.
 * @param workspaceId - Only chunks belonging to Documents in this
 * workspace are considered.
 * @param limit - Maximum number of chunks to return.
 * @returns The closest chunks, best match first.
 * @throws Error if the query embedding cannot be generated.
 */
export async function searchSimilarChunks(
  query: string,
  workspaceId: string,
  limit: number = 5,
): Promise<SimilarChunk[]> {
  const trimmed = query.trim();

  if (!trimmed || limit <= 0) return [];

  const embedding = await generateEmbedding(trimmed);

  // Chunks with a NULL embedding (the column is optional in the schema)
  // are excluded so they can't surface with a NULL similarity.
  const rows = await prisma.$queryRawUnsafe<SimilarChunk[]>(
    `SELECT c.id, c."documentId", c.content, 1 - (c.embedding <=> $1::vector) AS similarity
     FROM "DocumentChunk" c
     JOIN "Document" d ON c."documentId" = d.id
     WHERE d."workspaceId" = $2
       AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1::vector ASC
     LIMIT $3`,
    toPgVectorLiteral(embedding),
    workspaceId,
    Math.floor(Math.min(limit, 50)),
  );

  return rows;
}
