import { Client } from '@elastic/elasticsearch';

const esUrl = process.env['ELASTICSEARCH_URL'];

// If no ELASTICSEARCH_URL is provided, use a dummy client that silently skips operations
export const esClient = esUrl 
  ? new Client({ node: esUrl }) 
  : ({
      indices: {
        exists: async () => false,
        create: async () => {},
      },
      index: async () => {},
      search: async () => ({
        hits: { hits: [], total: { value: 0 } }
      })
    } as unknown as Client);

/**
 * Initializes the Elasticsearch index with appropriate mappings.
 */
export async function initializeElasticsearch() {
  if (!esUrl) {
    console.log('[elasticsearch] Skipped: No ELASTICSEARCH_URL provided. Search will be disabled.');
    return;
  }

  const indexName = 'emails';

  try {
    const exists = await esClient.indices.exists({ index: indexName });
    if (!exists) {
      await esClient.indices.create({
        index: indexName,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            recipient: { type: 'keyword' },
            subject: { type: 'text', analyzer: 'standard' },
            body: { type: 'text', analyzer: 'standard' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
          },
        },
      });
      console.log(`[elasticsearch] Created index "${indexName}"`);
    } else {
      console.log(`[elasticsearch] Index "${indexName}" already exists`);
    }
  } catch (error) {
    console.error('[elasticsearch] Failed to initialize index:', error);
  }
}
