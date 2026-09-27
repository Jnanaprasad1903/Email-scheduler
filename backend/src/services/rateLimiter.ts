import { redisConnection } from '../lib/redis.js';

export type RateLimitResult = 
  | { allowed: true }
  | { allowed: false; nextAvailableTime: number };

/**
 * Checks and increments the distributed rate limit for a campaign.
 * Uses a Redis Sorted Set to maintain a rolling window of the last hour.
 *
 * @param campaignId - The ID of the campaign
 * @param emailId - The ID of the email (used as a unique member in the ZSET)
 * @param hourlyLimit - The maximum emails allowed per hour
 */
export async function checkRateLimit(campaignId: string, emailId: string, hourlyLimit: number): Promise<RateLimitResult> {
  const key = `campaign:${campaignId}:ratelimit`;
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;

  // Lua script:
  // 1. Remove old entries
  // 2. Count current entries
  // 3. If count >= limit, find the OLDEST entry (lowest score) to calculate when a slot frees up
  // 4. If count < limit, add new entry and update TTL
  const luaScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
    local count = redis.call('ZCARD', KEYS[1])
    
    if tonumber(count) >= tonumber(ARGV[3]) then
      -- Get the oldest element's score
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      if oldest and oldest[2] then
         return oldest[2] -- Returns the timestamp of the oldest entry
      end
      return ARGV[1] -- Fallback
    end
    
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
    redis.call('EXPIRE', KEYS[1], 3600)
    return -1 -- Success indicator
  `;

  const result = await redisConnection.eval(
    luaScript,
    1,
    key,
    oneHourAgo,
    now,
    hourlyLimit,
    emailId
  );

  if (result === -1) {
    return { allowed: true };
  }

  // result is the timestamp of the oldest entry
  const oldestTimestamp = Number(result);
  const nextAvailableTime = oldestTimestamp + 3600 * 1000;
  
  return { allowed: false, nextAvailableTime };
}
