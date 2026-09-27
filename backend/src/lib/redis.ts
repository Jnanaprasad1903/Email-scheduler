import IORedis from 'ioredis';

/**
 * Shared IORedis connection for BullMQ.
 *
 * BullMQ requires maxRetriesPerRequest: null — without it, IORedis will
 * throw on commands that block for longer than the retry window (e.g.,
 * BRPOP used internally by BullMQ workers).
 *
 * lazyConnect: true — the connection is established on first use, not at
 * import time. This prevents startup failures if Redis isn't immediately
 * available.
 */
export const redisConnection = new IORedis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redisConnection.on('connect', () => console.log('[redis] Connected'));
redisConnection.on('error', (err) => console.error('[redis] Error:', err.message));
