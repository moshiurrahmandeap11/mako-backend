"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKnowledgeTool = searchKnowledgeTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchKnowledgeTool(merchantId, query, maxResults = 6) {
    try {
        let chunks = [];
        // 1. Vector similarity search (only when embeddings exist)
        try {
            const queryVector = await (0, embeddings_1.generateEmbedding)(query);
            const isRealVector = queryVector && queryVector.some((v) => v !== 0);
            if (isRealVector) {
                const vectorStr = `[${queryVector.join(',')}]`;
                const rawResults = await (0, db_1.executeRawNeonQuery)(`SELECT id, url, content, 
                  (embedding <=> $1::vector) as distance
           FROM "KnowledgeChunk"
           WHERE "merchantId" = $2 AND embedding IS NOT NULL
           ORDER BY distance ASC
           LIMIT $3`, [vectorStr, merchantId, maxResults]);
                if (rawResults && rawResults.length > 0) {
                    chunks = rawResults;
                }
            }
        }
        catch (e) {
            logger_1.logger.error('Vector search error in searchKnowledgeTool:', e);
        }
        // 2. Keyword token search (matches individual query words like 'project', 'pricing', 'portfolio', etc.)
        if (chunks.length === 0) {
            try {
                const words = query
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '')
                    .split(/\s+/)
                    .filter((w) => w.length >= 3);
                const whereConditions = [{ merchantId }];
                if (words.length > 0) {
                    const orList = words.map((w) => ({
                        content: { contains: w, mode: 'insensitive' },
                    }));
                    const textResults = await db_1.prisma.knowledgeChunk.findMany({
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
            }
            catch (err) {
                logger_1.logger.error('Keyword search error in searchKnowledgeTool:', err);
            }
        }
        // 3. Fallback: Fetch recent merchant knowledge chunks
        if (chunks.length === 0) {
            try {
                const fallbackChunks = await db_1.prisma.knowledgeChunk.findMany({
                    where: { merchantId },
                    take: maxResults,
                    orderBy: { createdAt: 'desc' },
                });
                if (fallbackChunks && fallbackChunks.length > 0) {
                    chunks = fallbackChunks;
                }
            }
            catch (err) {
                logger_1.logger.error('Failed fallback knowledgeChunk query:', err);
            }
        }
        return chunks.map((c) => ({
            url: c.url,
            content: c.content,
        }));
    }
    catch (error) {
        logger_1.logger.error('Error in searchKnowledgeTool:', error);
        return [];
    }
}
