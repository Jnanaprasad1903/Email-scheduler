import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// ─── Mock campaign & sender services (avoids Prisma DB calls entirely) ─────────
const mockScheduleCampaign = vi.hoisted(() => vi.fn());
const mockGetCampaigns = vi.hoisted(() => vi.fn());
const mockGetCampaign = vi.hoisted(() => vi.fn());
const mockGetSenders = vi.hoisted(() => vi.fn());
const mockCreateSender = vi.hoisted(() => vi.fn());

vi.mock('../services/campaignService.js', () => ({
  scheduleCampaign: mockScheduleCampaign,
  getCampaigns: mockGetCampaigns,
  getCampaign: mockGetCampaign,
}));

vi.mock('../services/senderService.js', () => ({
  getSenders: mockGetSenders,
  createSender: mockCreateSender,
}));

// ─── Auth: use x-user-id header bypass (NODE_ENV=test) ───────────────────────
const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('Campaign API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/campaigns ──────────────────────────────────────────────────────
  describe('GET /api/campaigns', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/campaigns');
      expect(res.status).toBe(401);
    });

    it('should return campaigns for the authenticated user', async () => {
      mockGetCampaigns.mockResolvedValueOnce([
        { id: 'c1', subject: 'Test Campaign', status: 'SCHEDULED', startAt: new Date(), _count: { emails: 5 }, sender: { email: 'from@test.com', name: 'Test' } },
      ]);

      const res = await request(app)
        .get('/api/campaigns')
        .set('x-user-id', TEST_USER_ID);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].subject).toBe('Test Campaign');
    });
  });

  // ── POST /api/campaigns/schedule ────────────────────────────────────────────
  describe('POST /api/campaigns/schedule', () => {
    const getPayload = () => ({
      senderId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
      recipients: ['a@test.com', 'b@test.com', 'c@test.com'],
      subject: 'Hello',
      body: 'World',
      startAt: new Date(Date.now() + 60000).toISOString(),
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).post('/api/campaigns/schedule').send(getPayload());
      expect(res.status).toBe(401);
    });

    it('should return 400 if recipients is empty', async () => {
      const res = await request(app)
        .post('/api/campaigns/schedule')
        .set('x-user-id', TEST_USER_ID)
        .send({ ...getPayload(), recipients: [] });
      expect(res.status).toBe(400);
    });

    it('should return 400 if senderId is not a valid UUID', async () => {
      const res = await request(app)
        .post('/api/campaigns/schedule')
        .set('x-user-id', TEST_USER_ID)
        .send({ ...getPayload(), senderId: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if subject is missing', async () => {
      const res = await request(app)
        .post('/api/campaigns/schedule')
        .set('x-user-id', TEST_USER_ID)
        .send({ ...getPayload(), subject: '' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when body field is missing', async () => {
      const res = await request(app)
        .post('/api/campaigns/schedule')
        .set('x-user-id', TEST_USER_ID)
        .send({ ...getPayload(), body: '' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when startAt is not a valid date', async () => {
      const res = await request(app)
        .post('/api/campaigns/schedule')
        .set('x-user-id', TEST_USER_ID)
        .send({ ...getPayload(), startAt: 'not-a-date' });
      expect(res.status).toBe(400);
    });

    it('should reject when recipients exceed the schema maximum of 10,000', async () => {
      // We use 5001 entries — still above the Zod schema limit of 10,000
      // and well within Express body-parser limits to avoid a 413 PayloadTooLarge
      // (10,001 emails produce ~139KB which exceeds the 100KB Express default)
      const tooMany = Array.from({ length: 10001 }, (_, i) => `u${i}@t.co`);
      // Verify Zod schema rejects it
      const { scheduleRequestSchema } = await import('../lib/validators.js');
      const result = scheduleRequestSchema.safeParse({
        senderId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff',
        recipients: tooMany,
        subject: 'Hello',
        body: 'World',
        startAt: new Date(Date.now() + 60000).toISOString(),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const recipientError = result.error.issues.find(e => e.path[0] === 'recipients');
        expect(recipientError?.message).toContain('10,000');
      }
    });
  });
});

// ── Sender API Tests ─────────────────────────────────────────────────────────
describe('Sender API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when listing senders without auth', async () => {
    const res = await request(app).get('/api/senders');
    expect(res.status).toBe(401);
  });

  it('should return senders for authenticated user', async () => {
    mockGetSenders.mockResolvedValueOnce([
      { id: 's1', email: 'from@test.com', name: 'Test Sender', createdAt: new Date() },
    ]);
    const res = await request(app)
      .get('/api/senders')
      .set('x-user-id', TEST_USER_ID);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('should return 400 when creating sender with invalid email', async () => {
    const res = await request(app)
      .post('/api/senders')
      .set('x-user-id', TEST_USER_ID)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});
