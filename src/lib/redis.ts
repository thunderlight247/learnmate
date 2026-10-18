// Shared Upstash Redis connection (Step 2 of the cache setup).
//
// Single place where credentials are read, so any server module that needs
// Redis (the cache layer in src/lib/cache.ts today, others later) talks to
// the same instantiated client instead of building its own.
//
// Credentials come from the Upstash console (REST API section):
//   UPSTASH_REDIS_REST_URL=...
//   UPSTASH_REDIS_REST_TOKEN=...
//
// When either is missing, `redis` is null and callers should degrade to
// their local fallback (cache.ts keeps an in-process Map in that case),
// never fail the request.

import { Redis } from '@upstash/redis';

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) return null;
  return new Redis({ url, token });
}

/** Connected Upstash client, or null when credentials are not configured. */
export const redis = createRedisClient();

/** True when the shared client is available and should be used first. */
export const isRedisEnabled = redis !== null;

if (redis) {
  console.log('[redis] Upstash Redis client enabled.');
}
