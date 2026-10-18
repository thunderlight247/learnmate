// Caching layer for AI responses and document summaries.
//
// Primary store: Upstash Redis over its HTTP REST API (serverless-friendly,
// no long-lived connections). Enable it by setting:
//   UPSTASH_REDIS_REST_URL=...   (from the Upstash console)
//   UPSTASH_REDIS_REST_TOKEN=...
//
// Without credentials the module degrades to a small in-process cache, so a
// single running Next server still avoids duplicate LLM calls within its
// lifetime; entries then die on restart and are not shared across instances.

import { redis, isRedisEnabled } from '@/lib/redis';

/** Default entry lifetime: 24 hours. */
export const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24;

/** Upper bound of the in-memory fallback (entries, not bytes). */
const MEMORY_CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  value?: unknown;
  expiresAt?: number;
}

const memoryCache = new Map<string, CacheEntry>();

const usingRedis = isRedisEnabled;

if (!usingRedis) {
  console.log('[cache] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-process cache fallback.');
}

/** Evicts expired entries; oldest-first when above the size cap. */
function pruneMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
  while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    memoryCache.delete(memoryCache.keys().next().value as string);
  }
}

/**
 * Reads a JSON-serializable cache entry.
 *
 * @param key - Namespaced cache key.
 * @returns The stored value, or null on miss / expiry / backend failure.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const value = (await redis.get<T>(key)) ?? null;
      if (value !== null) return value;
      // Fall through to check memory when Redis reports a miss; harmless.
    } catch (error) {
      console.warn('[cache] Redis read failed, trying memory fallback:', error);
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return (entry.value as T) ?? null;
}

/**
 * Writes a JSON-serializable value to both backends.
 *
 * @param key - Namespaced cache key.
 * @param value - JSON payload (keep LLM payloads reasonable in size).
 * @param ttlSeconds - Lifetime; defaults to 24h.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds));

  if (redis) {
    try {
      await redis.set(key, value, { ex: ttl });
    } catch (error) {
      console.warn('[cache] Redis write failed; memory fallback only for this entry:', error);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttl * 1000,
  });
  pruneMemoryCache();
}

/**
 * Convenience read-through helper: returns the cached value or runs
 * `produce`, stores its result, and returns it.
 */
export async function cached<T>(
  key: string,
  produce: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const fresh = await produce();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

/**
 * Deterministic cache key for a piece of content: `<namespace>:sha256(text)`.
 * Identical documents/questions therefore always map to the same entry.
 */
export function contentCacheKey(namespace: string, content: string): string {
  // Lazy require keeps Node's crypto out of edge bundles; this module only
  // runs in server routes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const hash = createHash('sha256').update(content).digest('hex');
  return `${namespace}:${hash}`;
}
