// Shared wrapper around the OpenRouter chat completion API.
// All routes use this helper so the app has one consistent place to configure the model,
// inject the API key, and normalize the response payload.
import '@/lib/polyfills';

const OPENROUTER_API_URL =
  'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterMessage {
  content?: string | null;
  /** Some reasoning/thinking models put their final answer here instead of content */
  reasoning?: string | null;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: OpenRouterMessage;
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

/** Backup free models to try in sequence if the primary model fails or times out. */
const FALLBACK_FREE_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3.5-super-vl:free',
  'liquid/lfm-2.5-2.6b:free',
];

async function callSingleModel(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
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
      signal: controller.signal,
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
          `OpenRouter credits limit reached: ${cleanMessage}. Please top up your account or set OPENROUTER_MODEL to a free model (e.g. openrouter/free) in .env.local.`,
        );
      }

      throw new Error(`AI service error (${response.status}): ${cleanMessage}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const msg = data.choices?.[0]?.message;
    // Prefer content; if null/empty, check reasoning
    const content = msg?.content || msg?.reasoning;

    if (!content || !content.trim()) {
      throw new Error('OpenRouter API returned no usable content.');
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Core chat-completions call accepting a full message array, with automatic
 * fallback model retries if the primary model fails, times out, or returns empty content.
 */
export async function callOpenRouterMessages(
  messages: ChatMessage[],
  options?: OpenRouterOptions,
): Promise<string> {
  const rawApiKey = process.env.OPENROUTER_API_KEY;
  const primaryModel =
    options?.model ||
    process.env.OPENROUTER_MODEL ||
    'openrouter/free';

  if (!rawApiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is missing from environment variables.',
    );
  }

  const apiKey = rawApiKey.replace(/['"]/g, '').trim();

  const maxTokens =
    options?.maxTokens ??
    (process.env.OPENROUTER_MAX_TOKENS
      ? parseInt(process.env.OPENROUTER_MAX_TOKENS, 10)
      : 3000);

  const temperature = options?.temperature ?? 0.3;

  // Build model try-list: primary first, followed by fallbacks (deduped)
  const candidateModels = [
    primaryModel,
    ...FALLBACK_FREE_MODELS.filter((m) => m !== primaryModel),
  ];

  let lastError: unknown;

  for (const modelToTry of candidateModels) {
    try {
      return await callSingleModel(
        modelToTry,
        messages,
        apiKey,
        maxTokens,
        temperature,
      );
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[OpenRouter] Model ${modelToTry} failed: ${errMsg}. Trying fallback...`);
      // If error was an explicit credit limit (402), don't retry paid models
      if (errMsg.includes('credits limit reached')) {
        break;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All AI models failed to return a response.');
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