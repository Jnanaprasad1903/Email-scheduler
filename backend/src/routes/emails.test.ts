import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { esClient } from '../lib/elasticsearch.js';

// Mock the Elasticsearch client so we don't need a real ES instance for unit tests
vi.mock('../lib/elasticsearch.js', () => ({
  esClient: {
    search: vi.fn(),
  },
}));

describe('GET /api/emails/search', () => {
  beforeAll(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if x-user-id header is missing', async () => {
    const res = await request(app).get('/api/emails/search?q=test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized: Missing x-user-id header');
  });

  it('should return 400 if query string "q" is missing', async () => {
    const res = await request(app)
      .get('/api/emails/search')
      .set('x-user-id', 'test-user-id');
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should call Elasticsearch and return hits on successful query', async () => {
    const mockHit = {
      id: 'test-email-id',
      subject: 'Hello World',
      body: 'This is a test email',
    };

    // Setup the mock response to mimic @elastic/elasticsearch v8
    vi.mocked(esClient.search).mockResolvedValueOnce({
      took: 10,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: 1, relation: 'eq' },
        max_score: 1,
        hits: [
          {
            _index: 'emails',
            _id: 'test-email-id',
            _score: 1,
            _source: mockHit,
          },
        ],
      },
    } as any);

    const res = await request(app)
      .get('/api/emails/search?q=Hello')
      .set('x-user-id', 'test-user-id');

    expect(res.status).toBe(200);
    expect(res.body.total.value).toBe(1);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toEqual(mockHit);

    // Verify esClient was called with the correct parameters
    expect(esClient.search).toHaveBeenCalledWith({
      index: 'emails',
      size: 20, // default limit
      query: {
        multi_match: {
          query: 'Hello',
          fields: ['subject^2', 'body', 'recipient'],
          fuzziness: 'AUTO',
        },
      },
    });
  });

  it('should pass through the limit parameter', async () => {
    vi.mocked(esClient.search).mockResolvedValueOnce({
      hits: {
        total: { value: 0, relation: 'eq' },
        hits: [],
      },
    } as any);

    await request(app)
      .get('/api/emails/search?q=test&limit=5')
      .set('x-user-id', 'test-user-id');

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 5,
      })
    );
  });
});
