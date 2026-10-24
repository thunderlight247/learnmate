// Dual AI gateway (provider fallback) with model tiering, response caching,
// and Bring-Your-Own-Key / Local Ollama support.

import { cacheGet, cacheSet, DEFAULT_CACHE_TTL_SECONDS } from '@/lib/cache';
import { callOpenRouterMessages, type ChatMessage } from '@/lib/openrouter';

export type { ChatMessage };

export type AiProvider = 'openrouter' | 'deepseek' | 'openai' | 'groq' | 'ollama' | 'cache';

/** Task complexity class used to pick the model tier. */
export type AiComplexity = 'simple' | 'complex';

export interface CustomAiConfig {
  provider?: 'default' | 'openrouter' | 'openai' | 'groq' | 'anthropic' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

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
  /** Custom user-provided AI configuration (Ollama, Groq, OpenAI, or personal key). */
  customConfig?: CustomAiConfig;
}

export interface AiResult {
  content: string;
  provider: AiProvider;
}

const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_TEMPERATURE = 0.7;
const COMPLEX_DEFAULT_MAX_TOKENS = 6000;
const ABSOLUTE_MAX_TOKENS = 8192;

export function clampMaxTokens(
  raw: number | undefined,
  complexity: AiComplexity,
): number {
  const fallback = complexity === 'complex' ? COMPLEX_DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS;
  const target = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : fallback;
  return Math.min(Math.max(1, Math.floor(target)), ABSOLUTE_MAX_TOKENS);
}

export function getAiModelForComplexity(complexity: AiComplexity): {
  openrouter: string;
  deepseek: string;
} {
  const isComplex = complexity === 'complex';
  const openrouter = isComplex
    ? process.env.OPENROUTER_COMPLEX_MODEL ||
      process.env.OPENROUTER_MODEL ||
      'openrouter/auto'
    : process.env.OPENROUTER_SIMPLE_MODEL ||
      process.env.OPENROUTER_MODEL ||
      'openrouter/free';

  const deepseek = isComplex
    ? process.env.DEEPSEEK_REASONER_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-reasoner'
    : process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  return { openrouter, deepseek };
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Calls an OpenAI-compatible completion endpoint (Ollama, Groq, OpenAI, or direct OpenRouter). */
async function callOpenAiCompatible(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 75_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Endpoint returned HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Received empty content from AI provider.');
    }

    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callDeepSeek(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured in the environment.');
  }

  const endpoint = `${(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')}/chat/completions`;
  return callOpenAiCompatible(endpoint, apiKey, model, messages, maxTokens, temperature);
}

/** Parses the optional x-custom-ai-config header sent by the client. */
export function extractCustomAiConfig(request: Request): CustomAiConfig | undefined {
  try {
    const headerVal = request.headers.get('x-custom-ai-config');
    if (headerVal) {
      const parsed = JSON.parse(headerVal);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as CustomAiConfig;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function callAiWithFallback(request: AiRequest): Promise<AiResult> {
  const { messages, customConfig } = request;
  const complexity: AiComplexity = request.complexity === 'complex' ? 'complex' : 'simple';
  const maxTokens = clampMaxTokens(request.maxTokens, complexity);
  const temperature = Number.isFinite(request.temperature)
    ? (request.temperature as number)
    : DEFAULT_TEMPERATURE;

  // Check cache first
  if (request.cacheKey) {
    try {
      const cached = await cacheGet<string>(request.cacheKey);
      if (cached !== null && typeof cached === 'string') {
        return { content: cached, provider: 'cache' };
      }
    } catch {
      // cache failures do not block live generation
    }
  }

  // 1. Try Custom Bring-Your-Own Provider if configured by user
  if (customConfig && customConfig.provider && customConfig.provider !== 'default') {
    try {
      if (customConfig.provider === 'ollama') {
        const baseUrl = (customConfig.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const model = customConfig.model || 'llama3';
        const content = await callOpenAiCompatible(
          `${baseUrl}/v1/chat/completions`,
          undefined,
          model,
          messages,
          maxTokens,
          temperature,
        );
        return { content, provider: 'ollama' };
      }

      if (customConfig.provider === 'groq' && customConfig.apiKey) {
        const model = customConfig.model || 'llama-3.3-70b-versatile';
        const content = await callOpenAiCompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          customConfig.apiKey,
          model,
          messages,
          maxTokens,
          temperature,
        );
        return { content, provider: 'groq' };
      }

      if (customConfig.provider === 'openai' && customConfig.apiKey) {
        const model = customConfig.model || 'gpt-4o-mini';
        const content = await callOpenAiCompatible(
          'https://api.openai.com/v1/chat/completions',
          customConfig.apiKey,
          model,
          messages,
          maxTokens,
          temperature,
        );
        return { content, provider: 'openai' };
      }

      if (customConfig.provider === 'openrouter' && customConfig.apiKey) {
        const model = customConfig.model || 'openrouter/auto';
        const content = await callOpenAiCompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          customConfig.apiKey,
          model,
          messages,
          maxTokens,
          temperature,
        );
        return { content, provider: 'openrouter' };
      }
    } catch (customErr) {
      console.warn(`[aiClient] Custom provider (${customConfig.provider}) failed, falling back to tiered default:`, toMessage(customErr));
    }
  }

  // 2. Default OpenRouter Tier
  const tierModels = getAiModelForComplexity(complexity);
  let openrouterError: unknown;

  try {
    const content = await callOpenRouterMessages(messages, {
      model: tierModels.openrouter,
      maxTokens,
      temperature,
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

  // 3. DeepSeek Fallback
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
