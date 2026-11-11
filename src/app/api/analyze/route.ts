import { NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdfExtractor';
import { callAiWithFallback, extractCustomAiConfig } from '@/lib/aiClient';
import { MAX_FILE_SIZE, MAX_FILE_SIZE_MB } from '@/lib/upload-limits';

// Request contract: multipart/form-data with a PDF file under the field name "file".
// The route extracts the document text, keeps it within a safe token budget, and asks
// the LLM to return a structured summary payload that the UI can render.
const MAX_TEXT_LENGTH = 25000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: 'Please upload a lecture PDF first.',
        },
        { status: 400 },
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        {
          error: 'Please upload a valid PDF file.',
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `The PDF must be ${MAX_FILE_SIZE_MB} MB or smaller.`,
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const text = await extractTextFromPDF(buffer);

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "We couldn't find readable text in this document.",
        },
        { status: 400 },
      );
    }

    const safeText =
      text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH)
        : text;

    const systemPrompt = `
You are LearnMate, an expert academic study assistant.

Your task is to analyze lecture material provided by a university student.

Return ONLY valid JSON. Do not use Markdown code fences.

The JSON must exactly follow this structure:

{
  "summary": "A concise but useful summary of the lecture material.",
  "keyConcepts": [
    "Important concept 1",
    "Important concept 2",
    "Important concept 3"
  ],
  "importantTopics": [
    "Important topic 1",
    "Important topic 2"
  ]
}

Rules:
1. Base the response primarily on the provided lecture material.
2. Do not invent concepts that are not supported by the material.
3. Preserve important technical terminology.
4. Explain complex ideas clearly.
5. The summary should be approximately 3-5 sentences.
6. Include the most academically important concepts.
7. Include the major topics covered.
8. Return valid JSON only.
`.trim();

    let parsedData: {
      summary?: string;
      keyConcepts?: string[];
      importantTopics?: string[];
    } | null = null;

    // Dual gateway: OpenRouter first, DeepSeek as fallback. A throw here
    // means both providers failed, and the outer catch turns it into the
    // 500 the UI renders.
    // Do not cache the response before validating its structure.
    const { content: aiContent, provider: providerUsed } = await callAiWithFallback({
      customConfig: extractCustomAiConfig(request),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: safeText },
      ],
      maxTokens: 3000,
      temperature: 0.7,
      complexity: 'simple',

    });

    try {
      // Clean Markdown fences and extract outer JSON object
      let cleaned = aiContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }

      try {
        parsedData = JSON.parse(cleaned);
      } catch {
        // Attempt quick trailing-comma / truncation repair
        const repaired = cleaned
          .replace(/,\s*([}\]])/g, '$1')
          .trim();
        try {
          parsedData = JSON.parse(repaired);
        } catch {
          console.warn('[Analyze] JSON parse failed');
        }
      }
    } catch (parseError) {
      // A malformed response cannot be presented as a reliable summary.
      console.warn('[Analyze] JSON parse failed:', parseError);
    }

    // Do not present invented concepts as document analysis.
    if (
      !parsedData ||
      typeof parsedData.summary !== 'string' ||
      !Array.isArray(parsedData.keyConcepts)
    ) {
      return NextResponse.json({ error: 'The AI returned an invalid analysis. Please retry.' }, { status: 502 });
    }

    parsedData.importantTopics = Array.isArray(parsedData.importantTopics) ? parsedData.importantTopics : [];

    return NextResponse.json({
      success: true,
      providerUsed,
      data: parsedData,
      rawText: safeText,
    });
  } catch (error: unknown) {
    console.error('Analysis Route Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'We could not analyze the material. Please try again.';

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}