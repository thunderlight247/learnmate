// Phase 3: multi-document RAG chat. Retrieves the most relevant document
// chunks from the workspace's vector index, augments the system prompt with
// them, and answers from chat history + retrieved context only.
//
// Request contract: { message, workspaceId, history? }.
// Legacy clients that still send { question, context } (the Phase 1 UI)
// are answered through the original in-memory path so nothing breaks
// before the frontend migrates.

import { NextResponse } from 'next/server';
import { callAiWithFallback, extractCustomAiConfig, type ChatMessage } from '@/lib/aiClient';
import { contentCacheKey } from '@/lib/cache';
import { searchSimilarChunks, type SimilarChunk } from '@/lib/embeddings';

const MAX_HISTORY_MESSAGES = 10;

interface ChatRequestBody {
  message?: unknown;
  workspaceId?: unknown;
  history?: unknown;
  // Legacy Phase 1 fields, detected before RAG validation runs.
  question?: unknown;
  context?: unknown;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Narrow, validated shape of the RAG request body. */
interface ParsedChatRequest {
  message: string;
  workspaceId: string;
  history: HistoryTurn[];
}

function parseHistory(raw: unknown): HistoryTurn[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;

  const turns: HistoryTurn[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('role' in item) ||
      !('content' in item)
    ) {
      return null;
    }
    const { role, content } = item as Record<string, unknown>;
    if (
      (role !== 'user' && role !== 'assistant') ||
      typeof content !== 'string'
    ) {
      return null;
    }
    turns.push({ role, content });
  }
  return turns;
}

function parseChatRequest(body: ChatRequestBody): ParsedChatRequest | null {
  const { message, workspaceId, history } = body;

  if (typeof message !== 'string' || !message.trim()) return null;
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) return null;

  const turns = parseHistory(history);
  if (turns === null) return null;

  return {
    message,
    workspaceId,
    history: turns.slice(-MAX_HISTORY_MESSAGES),
  };
}

function buildSystemPrompt(chunks: SimilarChunk[]): string {
  const contextBlock = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] (source document: ${chunk.documentId}, similarity: ${chunk.similarity.toFixed(3)})\n${chunk.content}`,
    )
    .join('\n\n---\n\n');

  return `
You are LearnMate, an expert AI learning assistant. Answer the user's question accurately using ONLY the provided document context passages below. If the answer cannot be found in the context, state that clearly.

Document Context Passages:
${contextBlock}
`.trim();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    // Legacy Phase 1 contract: { question, context } with no database.
    if (
      typeof body.message !== 'string' &&
      typeof body.question === 'string' &&
      typeof body.context === 'string'
    ) {
      const systemPrompt = `
You are LearnMate, an expert academic tutor.
Answer the user's question clearly and accurately based strictly on the provided lecture material below.
If the answer cannot be found in the material, mention that it's not explicitly in the text, but provide a brief helpful answer.

Document Context:
${body.context}
`.trim();

      // Identical question + context are served from cache instead of
      // spending tokens on a duplicate LLM call.
      const { content: answer, provider: providerUsed } = await callAiWithFallback({
        customConfig: extractCustomAiConfig(request),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.question },
        ],
        complexity: 'simple',
        cacheKey: contentCacheKey('chat:legacy', `${body.question}\n---\n${body.context}`),
      });

      return NextResponse.json({ answer, providerUsed });
    }

    const parsed = parseChatRequest(body);

    if (!parsed) {
      return NextResponse.json(
        {
          error:
            'A "message" and "workspaceId" are required. "history" is an optional array of { role: "user" | "assistant", content } turns.',
        },
        { status: 400 },
      );
    }

    // Strict retrieval budget: at most 4 chunks per prompt (token bloat cap).
    const chunks = await searchSimilarChunks(
      parsed.message,
      parsed.workspaceId,
      4,
    );

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          response:
            "I couldn't find any processed documents in this workspace yet. Upload and process a PDF first, then ask your question again.",
          sources: [],
        },
        { status: 200 },
      );
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(chunks) },
      ...parsed.history.map((turn) => ({
        role: turn.role as ChatMessage['role'],
        content: turn.content,
      })),
      { role: 'user', content: parsed.message },
    ];

    const { content: response, provider: providerUsed } = await callAiWithFallback({
      customConfig: extractCustomAiConfig(request),
      messages,
      complexity: 'simple',
      // Keyed on the full exchange (question + history + retrieved context):
      // asking the same question again with the same context hits the cache.
      cacheKey: contentCacheKey('chat:rag', JSON.stringify(messages)),
    });

    return NextResponse.json({
      response,
      providerUsed,
      sources: chunks.map((chunk) => ({
        documentId: chunk.documentId,
        content: chunk.content,
        similarity: chunk.similarity,
      })),
    });
  } catch (error: unknown) {
    console.error('RAG Chat API Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to answer the question. Please try again.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
