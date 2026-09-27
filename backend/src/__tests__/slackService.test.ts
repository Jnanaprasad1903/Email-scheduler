import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Slack fetch and Redis ────────────────────────────────────────────────
const kvStore: Record<string, string> = {};
vi.mock('../lib/redis.js', () => ({
  redisConnection: {
    get: vi.fn(async (key: string) => kvStore[key] ?? null),
    set: vi.fn(async (key: string, value: string) => { kvStore[key] = value; return 'OK'; }),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { notifyRateLimitReached, notifyCampaignCompleted } from '../services/slackService.js';

describe('Slack Notification Service', () => {
  beforeEach(() => {
    Object.keys(kvStore).forEach(k => delete kvStore[k]);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  // ── Slack Disconnected ────────────────────────────────────────────────────
  describe('when Slack is NOT connected (no webhookUrl)', () => {
    it('should silently skip without crashing when webhookUrl is null', async () => {
      await expect(notifyRateLimitReached(null, 'sender@test.com', 'Campaign A', 50))
        .resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should silently skip without crashing when webhookUrl is undefined', async () => {
      await expect(notifyRateLimitReached(undefined, 'sender@test.com', 'Campaign A', 50))
        .resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── Rate Limit Notifications ──────────────────────────────────────────────
  describe('notifyRateLimitReached', () => {
    const webhookUrl = 'https://hooks.slack.com/services/TEST/TOKEN/123';

    it('should POST to the Slack webhook when limit is reached', async () => {
      await notifyRateLimitReached(webhookUrl, 'sender@test.com', 'Big Campaign', 50);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(webhookUrl, expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('should include sender email and limit in the Slack message body', async () => {
      await notifyRateLimitReached(webhookUrl, 'noreply@mycompany.com', 'Q4 Outreach', 100);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain('noreply@mycompany.com');
      expect(body.text).toContain('100');
    });

    it('should NOT send a second notification if already notified (debounce)', async () => {
      await notifyRateLimitReached(webhookUrl, 'sender@test.com', 'Campaign A', 50);
      await notifyRateLimitReached(webhookUrl, 'sender@test.com', 'Campaign A', 50);
      await notifyRateLimitReached(webhookUrl, 'sender@test.com', 'Campaign A', 50);

      // Only 1 call despite being invoked 3 times — Redis TTL debounce working
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should send notification for a different sender even if one sender is debounced', async () => {
      await notifyRateLimitReached(webhookUrl, 'sender-a@test.com', 'Campaign A', 50);
      await notifyRateLimitReached(webhookUrl, 'sender-b@test.com', 'Campaign B', 50);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should NOT crash if Slack webhook returns an error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(notifyRateLimitReached(webhookUrl, 'sender@test.com', 'Campaign A', 50))
        .resolves.not.toThrow();
    });
  });

  // ── Campaign Completion Notifications ─────────────────────────────────────
  describe('notifyCampaignCompleted', () => {
    const webhookUrl = 'https://hooks.slack.com/services/TEST/TOKEN/456';

    it('should POST to the Slack webhook when campaign completes', async () => {
      await notifyCampaignCompleted(webhookUrl, 'campaign-id-1', 'Final Newsletter');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('should include campaign subject in the completion message', async () => {
      await notifyCampaignCompleted(webhookUrl, 'campaign-id-1', 'Final Newsletter');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain('Final Newsletter');
    });

    it('should silently skip if Slack is disconnected', async () => {
      await notifyCampaignCompleted(null, 'campaign-id-1', 'Final Newsletter');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
