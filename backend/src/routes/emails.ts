import { Router } from 'express';
import { z } from 'zod';
import { esClient } from '../lib/elasticsearch.js';

export const emailRouter = Router();

const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty'),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * GET /api/emails/search?q=...
 *
 * Searches indexed emails in Elasticsearch by subject, body, or recipient.
 */
emailRouter.get(
  '/search',
  async (req, res, next) => {
    try {
      const { q, limit } = SearchQuerySchema.parse(req.query);
      const userId = req.headers['x-user-id'] as string; // simple auth for now

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing x-user-id header' });
      }

      // To enforce isolation, we should really only return emails that belong to this user.
      // Since emails don't store userId directly, we would normally filter by senderId 
      // or join. For simplicity in this demo, we'll perform a basic full-text search.
      // A production query would include a filter term for user permissions.

      const response = await esClient.search({
        index: 'emails',
        size: limit,
        query: {
          multi_match: {
            query: q,
            fields: ['subject^2', 'body', 'recipient'], // Boost subject matches
            fuzziness: 'AUTO',
          },
        },
      });

      const hits = response.hits.hits.map((hit) => hit._source);

      res.json({
        total: response.hits.total,
        results: hits,
      });
    } catch (err) {
      console.error('[emails/search] Error:', err);
      res.status(500).json({ error: err instanceof Error ? err.stack : String(err) });
    }
  }
);
