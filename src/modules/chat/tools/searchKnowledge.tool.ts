import { executeRawNeonQuery } from '../../../config/db';
import { generateEmbedding } from '../../../utils/embeddings';
import { logger } from '../../../utils/logger';

export async function searchKnowledgeTool(
  merchantId: string,
  query: string,
  maxResults: number = 3
) {
  try {
    const queryVector = await generateEmbedding(query);
    let chunks: any[] = [];

    try {
      const rawResults = await executeRawNeonQuery(
        `SELECT id, url, content, 
                (embedding <=> $1::vector) as distance
         FROM "KnowledgeChunk"
         WHERE "merchantId" = $2
         ORDER BY distance ASC
         LIMIT $3`,
        [queryVector, merchantId, maxResults]
      );

      if (rawResults && rawResults.length > 0) {
        // Return the top most relevant chunks. We don't use a strict distance threshold
        // because we always want to provide some context about the website to the AI.
        chunks = rawResults;
      }
    } catch (e) {
      logger.error('Failed to search KnowledgeChunk vectors:', e);
    }

    return chunks.map((c) => ({
      url: c.url,
      content: c.content,
    }));
  } catch (error) {
    logger.error('Error in searchKnowledgeTool:', error);
    return [];
  }
}
