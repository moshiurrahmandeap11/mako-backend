import { prisma, executeRawNeonQuery } from '../../../config/db';
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
        chunks = rawResults;
      }
    } catch (e) {
      logger.error('Failed to search KnowledgeChunk vectors:', e);
    }

    // Fallback: If vector search returns 0 chunks, fetch top scraped knowledge chunks
    if (chunks.length === 0) {
      try {
        const fallbackChunks = await prisma.knowledgeChunk.findMany({
          where: { merchantId },
          take: maxResults,
        });
        if (fallbackChunks && fallbackChunks.length > 0) {
          chunks = fallbackChunks;
        }
      } catch (err) {
        logger.error('Failed fallback knowledgeChunk query:', err);
      }
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
