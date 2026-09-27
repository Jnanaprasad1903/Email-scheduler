import { Client } from '@elastic/elasticsearch';

const esUrl = process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9200';

export const esClient = new Client({
  node: esUrl,
});

/**
 * Initializes the Elasticsearch index with appropriate mappings.
 */
export async function initializeElasticsearch() {
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
