// Dual AI gateway (provider fallback) with model tiering + response caching.
//
// OpenRouter is the primary provider; when it fails — non-OK status such as
// 402 credit errors, a network exception, or an empty payload — the request
// is transparently retried against DeepSeek's direct API and the caller is
// told which provider actually answered.
//
// Model tiering keeps token spend aligned with task complexity:
//   - `simple`:  summarization, flashcards, quizzes — fast/cheap models.
//   - `complex`: JSON blueprint generation & canvas graphs — high-reasoning
//                models that can afford long structured output.
// Tiers are overridable via env (OPENROUTER_SIMPLE_MODEL,
// OPENROUTER_COMPLEX_MODEL, DEEPSEEK_MODEL, DEEPSEEK_REASONER_MODEL).
//
// Response caching: pass a `cacheKey` to store the completion under it and
// serve identical inputs without a second LLM call (see src/lib/cache.ts).

import { cacheGet, cacheSet, DEFAULT_CACHE_TTL_SECONDS } from '@/lib/cache';
import { callOpenRouterMessages, type ChatMessage } from '@/lib/openrouter';

export type { ChatMessage };

export type AiProvider = 'openrouter' | 'deepseek' | 'cache';

/** Task complexity class used to pick the model tier. */
export type AiComplexity = 'simple' | 'complex';

export interface AiRequest {
  messages: ChatMessage[];
  /** Requested output budget. Defaults to 3000 (6000 for complex tasks) and is always clamped. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.7. */
  temperature?: number;
  /** Model tier for this task. Defaults to 'simple'. */
  complexity?: AiComplexity;
  /**
   * Response cache key. When given, identical requests are served from cache
   * without an LLM call and fresh results are stored for the next caller.
   */
  cacheKey?: string;
  /** Cache entry lifetime when `cacheKey` is used. Defaults to 24h. */
  cacheTtlSeconds?: number;
}

export interface AiResult {
  content: string;
  provider: AiProvider;
}

const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_TEMPERATURE = 0.7;
/**
 * Default output budget for complex tasks: reasoning models can burn 2.5k+
 * tokens thinking before writing a byte of JSON.
 */
const COMPLEX_DEFAULT_MAX_TOKENS = 6000;
/**
 * Hard ceiling for `max_tokens`. DeepSeek's chat models cap output around
 * 8k tokens, so nothing above that is ever valid to send — a caller passing
 * 64000 gets clamped instead of a rejected request from both providers.
 */
const MAX_TOKENS_CEILING = 8000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_TIMEOUT_MS = 45_000;

/**
 * Resolves the model to use on each provider for the requested task tier.
 * Exported so JSON-heavy callers (blueprint generator, lab protocol) can
 * route through the full callOpenRouter retry chain directly while still
 * honoring the tier configuration.
 */
export function getAiModelForComplexity(complexity: AiComplexity): {
  openrouter: string;
  deepseek: string;
} {
  if (complexity === 'complex') {
    return {
      // High-reasoning free model for canvas/blueprint generation. It thinks
      // in a reasoning channel, so callers must budget ≥ 6k output tokens.
      openrouter: process.env.OPENROUTER_COMPLEX_MODEL || 'nvidia/nemotron-3.5-super-vl:free',
      deepseek: process.env.DEEPSEEK_REASONER_MODEL || 'deepseek-reasoner',
    };
  }
  return {
    // Fast/cheap default for summarization, flashcards, quizzes.
    openrouter: process.env.OPENROUTER_SIMPLE_MODEL || 'openrouter/free',
    deepseek: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
}

/** Clamps a requested token budget into (0, MAX_TOKENS_CEILING]. */
function clampMaxTokens(maxTokens: number | undefined, complexity: AiComplexity): number {
  const fallback =
    complexity === 'complex' && maxTokens === undefined ? COMPLEX_DEFAULT_MAX_TOKENS : maxTokens;
  const requested = Number(fallback ?? DEFAULT_MAX_TOKENS);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(Math.floor(requested), MAX_TOKENS_CEILING);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads `error.message` out of a provider's JSON error body when present. */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Body is not JSON; fall through to the raw text.
  }
  return body;
}

/** Direct DeepSeek chat-completions call (the fallback leg). */
async function callDeepSeek(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set in the environment.');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${extractErrorMessage(body)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content || !content.trim()) {
    throw new Error('DeepSeek API returned no usable content.');
  }

  return content;
}

/**
 * Calls OpenRouter first and falls back to DeepSeek's direct API, honoring
 * the task's model tier and optional response cache.
 *
 * @param request - Chat messages, optional `maxTokens` (default 3000, clamped
 * to a safe ceiling; complex tasks default to 6000), `temperature` (default
 * 0.7), `complexity` tier (default 'simple'), and an optional `cacheKey`.
 * @returns The completion text and which provider produced it.
 * @throws A single readable error naming both providers' failures, thrown
 * only when OpenRouter *and* DeepSeek have both failed.
 */
export async function callAiWithFallback(request: AiRequest): Promise<AiResult> {
  const { messages } = request;
  const complexity: AiComplexity = request.complexity === 'complex' ? 'complex' : 'simple';
  const maxTokens = clampMaxTokens(request.maxTokens, complexity);
  const temperature = Number.isFinite(request.temperature)
    ? (request.temperature as number)
    : DEFAULT_TEMPERATURE;

  if (request.cacheKey) {
    try {
      const cached = await cacheGet<string>(request.cacheKey);
      if (cached !== null && typeof cached === 'string') {
        return { content: cached, provider: 'cache' };
      }
    } catch {
      // Cache failures must never block a live generation.
    }
  }

  const tierModels = getAiModelForComplexity(complexity);
  let openrouterError: unknown;

  try {
    const content = await callOpenRouterMessages(messages, {
      model: tierModels.openrouter,
      maxTokens,
      temperature,
      // A reasoning trace is a thinking process, never the answer: reject it
      // so this attempt fails over to the next provider instead of shipping
      // prose to a JSON-parsing caller.
      useReasoningFallback: false,
    });
    if (request.cacheKey) {
      await cacheSet(
        request.cacheKey,
        content,
        request.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
      );
    }
    return { content, provider: 'openrouter' };
  } catch (error) {
    openrouterError = error;
    console.warn(
      '[aiClient] OpenRouter failed, falling back to DeepSeek:',
      toMessage(error),
    );
  }

  try {
    const content = await callDeepSeek(messages, tierModels.deepseek, maxTokens, temperature);
    if (request.cacheKey) {
      await cacheSet(
        request.cacheKey,
        content,
        request.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
      );
    }
    return { content, provider: 'deepseek' };
  } catch (deepseekError) {
    throw new Error(
      `Both AI providers failed. OpenRouter: ${toMessage(openrouterError)} DeepSeek: ${toMessage(deepseekError)}`,
    );
  }
}
