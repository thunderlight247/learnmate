// Phase 2: document processing utilities for the RAG pipeline.
// Converts uploaded PDF buffers into raw text and splits that text into
// semantic chunks sized for vector embeddings. Intentionally free of any
// embedding or persistence logic so routes can compose these pieces freely.

import '@/lib/polyfills';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Rough token estimate. Modern tokenizers average ~4 characters per token
 * for English prose, which is accurate enough for chunk budgeting.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Extracts raw text from a PDF buffer using unpdf (which bundles
 * pdf.js and works out of the box in Node and edge runtimes).
 *
 * @param buffer - The raw bytes of the uploaded PDF file.
 * @returns The merged text of all pages, trimmed. Empty string for scanned
 * PDFs with no extractable text layer.
 * @throws Error if the buffer is empty or the PDF cannot be parsed.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Cannot extract text from an empty PDF buffer.');
  }

  try {
    // unpdf's API expects Uint8Array rather than Node's Buffer.
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    // The `mergePages: true` overload guarantees `text` is a single string.
    const { text } = await extractText(pdf, { mergePages: true });

    return text.trim();
  } catch (error) {
    console.error('PDF Parsing Error:', error);
    throw new Error('Failed to extract text from the PDF file.');
  }
}

/**
 * Splits a large string into semantic chunks that each fit within a token
 * budget, ready to be embedded.
 *
 * Strategy (most to least semantic):
 *   1. Split on paragraphs (double newlines) and pack as many as fit.
 *   2. For oversized paragraphs, split on sentence boundaries.
 *   3. For oversized sentences, hard-split on word boundaries.
 *
 * @param text - The full document text to chunk.
 * @param maxTokens - Maximum estimated tokens per chunk.
 * @returns An ordered array of non-empty chunks.
 */
export function chunkText(text: string, maxTokens: number = 500): string[] {
  if (!text.trim()) return [];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    // A paragraph wider than the budget is pre-split so the packing
    // loop below only ever sees pieces that fit.
    for (const piece of splitOversizedParagraph(paragraph, maxTokens)) {
      const candidate = current ? `${current}\n\n${piece}` : piece;

      if (current && estimateTokens(candidate) > maxTokens) {
        chunks.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

/**
 * Estimates the token count of a string (~4 characters per token).
 * Exported so the embedding phase can reuse the same accounting.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Splits a paragraph that exceeds the token budget into
 * sentence-aligned pieces, falling back to word splits.
 */
function splitOversizedParagraph(
  paragraph: string,
  maxTokens: number,
): string[] {
  if (estimateTokens(paragraph) <= maxTokens) return [paragraph];

  // Match sentence-sized runs: everything up to and including terminal
  // punctuation (plus closing quotes/brackets), or the trailing fragment.
  const sentences =
    paragraph.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) ?? [paragraph];

  const pieces: string[] = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (estimateTokens(sentence) > maxTokens) {
      if (current) {
        pieces.push(current);
        current = '';
      }
      pieces.push(...hardSplitWords(sentence, maxTokens));
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && estimateTokens(candidate) > maxTokens) {
      pieces.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) pieces.push(current);

  return pieces;
}

/**
 * Last-resort split: breaks a single oversized sentence on word
 * boundaries, slicing mid-word only when a single word is longer
 * than the entire budget.
 */
function hardSplitWords(text: string, maxTokens: number): string[] {
  const maxChars = Math.max(1, maxTokens * CHARS_PER_TOKEN);
  const pieces: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/)) {
    if (!word) continue;

    if (word.length > maxChars) {
      // Single word exceeds the budget; slice it into hard pieces.
      if (current) {
        pieces.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxChars) {
        pieces.push(word.slice(i, i + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxChars) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) pieces.push(current);

  return pieces;
}
