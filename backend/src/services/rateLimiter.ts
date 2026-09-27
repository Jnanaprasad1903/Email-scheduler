import { redisConnection } from '../lib/redis.js';

/**
 * Checks and increments the distributed rate limit for a campaign.
 * Uses a Redis Sorted Set to maintain a rolling window of the last hour.
 *
 * @param campaignId - The ID of the campaign
 * @param emailId - The ID of the email (used as a unique member in the ZSET)
 * @param hourlyLimit - The maximum emails allowed per hour
 * @returns boolean - True if the email is allowed to send, false if rate limited
 */
export async function checkRateLimit(campaignId: string, emailId: string, hourlyLimit: number): Promise<boolean> {
  const key = `campaign:${campaignId}:ratelimit`;
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;

  // Lua script ensures atomicity across multiple concurrent workers.
  // 1. Remove old entries
  // 2. Count current entries
  // 3. If count < limit, add new entry and update TTL
  // 4. Return 1 if allowed, 0 if rate limited
  const luaScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
    local count = redis.call('ZCARD', KEYS[1])
    if tonumber(count) >= tonumber(ARGV[3]) then
      return 0
    end
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
    redis.call('EXPIRE', KEYS[1], 3600)
    return 1
  `;

  // redis.eval(script, numKeys, key1, ..., arg1, arg2, ...)
  const result = await redisConnection.eval(
    luaScript,
    1,
    key,
    oneHourAgo,
    now,
    hourlyLimit,
    emailId
  );

  return result === 1;
}
