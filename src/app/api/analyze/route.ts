import { NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdfExtractor';
import { callOpenRouter } from '@/lib/openrouter';
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

    const aiResponse = await callOpenRouter(
      systemPrompt,
      safeText,
    );

    const cleanedResponse = aiResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedData;

    try {
      parsedData = JSON.parse(cleanedResponse);
    } catch {
      console.error(
        'Invalid JSON returned by AI:',
        aiResponse,
      );

      return NextResponse.json(
        {
          error:
            'The AI returned an invalid analysis. Please try again.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
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