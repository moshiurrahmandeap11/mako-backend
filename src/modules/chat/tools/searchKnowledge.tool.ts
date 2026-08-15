import { prisma, executeRawNeonQuery } from '../../../config/db';
import { generateEmbedding } from '../../../utils/embeddings';
import { logger } from '../../../utils/logger';

export async function searchKnowledgeTool(
  merchantId: string,
  query: string,
  maxResults: number = 6
) {
  try {
    let chunks: any[] = [];

    // 1. Vector similarity search (only when embeddings exist)
    try {
      const queryVector = await generateEmbedding(query);
      const isRealVector = queryVector && queryVector.some((v) => v !== 0);

      if (isRealVector) {
        const vectorStr = `[${queryVector.join(',')}]`;
        const rawResults = await executeRawNeonQuery(
          `SELECT id, url, content, 
                  (embedding <=> $1::vector) as distance
           FROM "KnowledgeChunk"
           WHERE "merchantId" = $2 AND embedding IS NOT NULL
           ORDER BY distance ASC
           LIMIT $3`,
          [vectorStr, merchantId, maxResults]
        );

        if (rawResults && rawResults.length > 0) {
          chunks = rawResults;
        }
      }
    } catch (e) {
      logger.error('Vector search error in searchKnowledgeTool:', e);
    }

    // 2. Keyword token search (matches individual query words like 'project', 'pricing', 'portfolio', etc.)
    if (chunks.length === 0) {
      try {
        const words = query
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length >= 3);

        const whereConditions: any[] = [{ merchantId }];
        if (words.length > 0) {
          const orList = words.map((w) => ({
            content: { contains: w, mode: 'insensitive' as const },
          }));
          const textResults = await prisma.knowledgeChunk.findMany({
            where: {
              merchantId,
              OR: orList,
            },
            take: maxResults,
            orderBy: { createdAt: 'desc' },
          });

          if (textResults && textResults.length > 0) {
            chunks = textResults;
          }
        }
      } catch (err) {
        logger.error('Keyword search error in searchKnowledgeTool:', err);
      }
    }

    // 3. Fallback: Fetch recent merchant knowledge chunks
    if (chunks.length === 0) {
      try {
        const fallbackChunks = await prisma.knowledgeChunk.findMany({
          where: { merchantId },
          take: maxResults,
          orderBy: { createdAt: 'desc' },
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
