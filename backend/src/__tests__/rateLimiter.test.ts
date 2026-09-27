import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Redis ────────────────────────────────────────────────────────────────
// We use a simple in-memory store to simulate Redis ZSET + GET/SET operations
// without requiring a live Redis connection for unit tests.
const redisStore: Record<string, { score: number; member: string }[]> = {};
const kvStore: Record<string, string> = {};

vi.mock('../lib/redis.js', () => ({
  redisConnection: {
    eval: vi.fn(async (script: string, numKeys: number, key: string, oneHourAgo: number, now: number, limit: number, emailId: string) => {
      // Simulate ZREMRANGEBYSCORE
      if (!redisStore[key]) redisStore[key] = [];
      redisStore[key] = redisStore[key].filter(e => e.score > oneHourAgo);

      const count = redisStore[key].length;

      if (count >= limit) {
        // Return timestamp of oldest entry (as a string, like Redis does)
        const oldest = redisStore[key][0];
        return String(oldest.score);
      }

      // ZADD
      redisStore[key].push({ score: now, member: emailId });
      redisStore[key].sort((a, b) => a.score - b.score);
      return -1; // success
    }),
    get: vi.fn(async (key: string) => kvStore[key] ?? null),
    set: vi.fn(async (key: string, value: string) => { kvStore[key] = value; return 'OK'; }),
  },
}));

import { checkRateLimit } from '../services/rateLimiter.js';

// ─── Rate Limiter Unit Tests ───────────────────────────────────────────────────
describe('Rate Limiter (Redis Rolling-Window Lua Script)', () => {
  beforeEach(() => {
    // Clear all in-memory stores before each test
    Object.keys(redisStore).forEach(k => delete redisStore[k]);
    Object.keys(kvStore).forEach(k => delete kvStore[k]);
    vi.stubEnv('MAX_EMAILS_PER_HOUR', '3');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should allow emails under the hourly limit', async () => {
    const result1 = await checkRateLimit('sender@test.com', 'email-id-1');
    const result2 = await checkRateLimit('sender@test.com', 'email-id-2');
    const result3 = await checkRateLimit('sender@test.com', 'email-id-3');

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
  });

  it('should block the (limit + 1)th email and return next available time', async () => {
    await checkRateLimit('sender@test.com', 'email-id-1');
    await checkRateLimit('sender@test.com', 'email-id-2');
    await checkRateLimit('sender@test.com', 'email-id-3');

    const result = await checkRateLimit('sender@test.com', 'email-id-4');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.nextAvailableTime).toBeGreaterThan(Date.now());
    }
  });

  it('should scope rate limits per sender — different senders do not share limits', async () => {
    await checkRateLimit('sender-a@test.com', 'email-1');
    await checkRateLimit('sender-a@test.com', 'email-2');
    await checkRateLimit('sender-a@test.com', 'email-3');

    // sender-a is now at limit; sender-b should still be allowed
    const resultB = await checkRateLimit('sender-b@test.com', 'email-4');
    expect(resultB.allowed).toBe(true);
  });

  it('nextAvailableTime should be ~1 hour from the oldest entry in the window', async () => {
    const before = Date.now();
    await checkRateLimit('sender@test.com', 'email-id-1');
    await checkRateLimit('sender@test.com', 'email-id-2');
    await checkRateLimit('sender@test.com', 'email-id-3');

    const result = await checkRateLimit('sender@test.com', 'email-id-4');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      const diff = result.nextAvailableTime - before;
      // Should be roughly 1 hour (3600000ms), within a 5-second tolerance
      expect(diff).toBeGreaterThan(3600000 - 5000);
      expect(diff).toBeLessThan(3600000 + 5000);
    }
  });

  it('should read MAX_EMAILS_PER_HOUR from environment variable', async () => {
    vi.stubEnv('MAX_EMAILS_PER_HOUR', '1');

    const result1 = await checkRateLimit('env-test@test.com', 'email-1');
    expect(result1.allowed).toBe(true);

    const result2 = await checkRateLimit('env-test@test.com', 'email-2');
    expect(result2.allowed).toBe(false);
  });
});
