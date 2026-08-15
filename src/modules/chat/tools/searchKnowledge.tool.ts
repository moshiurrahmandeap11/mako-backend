import { prisma, executeRawNeonQuery } from '../../../config/db';
import { generateEmbedding } from '../../../utils/embeddings';
import { logger } from '../../../utils/logger';

export async function searchKnowledgeTool(
  merchantId: string,
  query: string,
  maxResults: number = 4
) {
  try {
    const queryVector = await generateEmbedding(query);
    const vectorStr = `[${queryVector.join(',')}]`;
    let chunks: any[] = [];

    try {
      const rawResults = await executeRawNeonQuery(
        `SELECT id, url, content, 
                (embedding <=> $1::vector) as distance
         FROM "KnowledgeChunk"
         WHERE "merchantId" = $2
         ORDER BY distance ASC
         LIMIT $3`,
        [vectorStr, merchantId, maxResults]
      );

      if (rawResults && rawResults.length > 0) {
        chunks = rawResults;
      }
    } catch (e) {
      logger.error('Failed to search KnowledgeChunk vectors:', e);
    }

    // Fallback 1: Text search if vector search returns 0
    if (chunks.length === 0) {
      try {
        const textResults = await prisma.knowledgeChunk.findMany({
          where: {
            merchantId,
            content: { contains: query, mode: 'insensitive' },
          },
          take: maxResults,
        });
        if (textResults && textResults.length > 0) {
          chunks = textResults;
        }
      } catch {}
    }

    // Fallback 2: General top merchant chunks
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
