// Shared wrapper around the OpenRouter chat completion API.
// All routes use this helper so the app has one consistent place to configure the model,
// inject the API key, and normalize the response payload.
const OPENROUTER_API_URL =
  'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/** A single chat message in OpenAI-compatible format. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options to override model, token limit, or temperature for a completion. */
export interface OpenRouterOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Core chat-completions call accepting a full message array, so callers
 * can hold multi-turn conversations (e.g. the RAG chat route).
 */
export async function callOpenRouterMessages(
  messages: ChatMessage[],
  options?: OpenRouterOptions,
): Promise<string> {
  const rawApiKey = process.env.OPENROUTER_API_KEY;
  const model =
    options?.model ||
    process.env.OPENROUTER_MODEL ||
    'anthropic/claude-3-haiku';

  if (!rawApiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is missing from environment variables.',
    );
  }

  // Strip accidental quotes or surrounding whitespace from the key
  const apiKey = rawApiKey.replace(/['"]/g, '').trim();

  // Set a safe max_tokens default so OpenRouter doesn't reserve the model's
  // maximum context limit (which causes HTTP 402 when account credit is low).
  const maxTokens =
    options?.maxTokens ??
    (process.env.OPENROUTER_MAX_TOKENS
      ? parseInt(process.env.OPENROUTER_MAX_TOKENS, 10)
      : 3000);

  const temperature = options?.temperature ?? 0.3;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'LearnMate',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let cleanMessage = errorText;

    try {
      const parsed = JSON.parse(errorText) as {
        error?: { message?: string };
      };
      if (parsed?.error?.message) {
        cleanMessage = parsed.error.message;
      }
    } catch {
      // Keep errorText if not JSON
    }

    if (response.status === 402 || cleanMessage.toLowerCase().includes('credit')) {
      throw new Error(
        `OpenRouter credits limit reached: ${cleanMessage}. Please top up your account or set OPENROUTER_MODEL to a free model (e.g. google/gemini-2.0-flash-exp:free) in .env.local.`,
      );
    }

    throw new Error(`AI service error (${response.status}): ${cleanMessage}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter API returned no usable content.');
  }

  return content;
}

/**
 * Convenience wrapper preserving the original two-argument signature used
 * by the analyze/quiz routes: a system prompt plus a single user prompt.
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  options?: OpenRouterOptions,
): Promise<string> {
  return callOpenRouterMessages(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options,
  );
}