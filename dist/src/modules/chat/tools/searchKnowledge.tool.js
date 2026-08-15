"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKnowledgeTool = searchKnowledgeTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchKnowledgeTool(merchantId, query, maxResults = 4) {
    try {
        const queryVector = await (0, embeddings_1.generateEmbedding)(query);
        const vectorStr = `[${queryVector.join(',')}]`;
        let chunks = [];
        try {
            const rawResults = await (0, db_1.executeRawNeonQuery)(`SELECT id, url, content, 
                (embedding <=> $1::vector) as distance
         FROM "KnowledgeChunk"
         WHERE "merchantId" = $2
         ORDER BY distance ASC
         LIMIT $3`, [vectorStr, merchantId, maxResults]);
            if (rawResults && rawResults.length > 0) {
                chunks = rawResults;
            }
        }
        catch (e) {
            logger_1.logger.error('Failed to search KnowledgeChunk vectors:', e);
        }
        // Fallback 1: Text search if vector search returns 0
        if (chunks.length === 0) {
            try {
                const textResults = await db_1.prisma.knowledgeChunk.findMany({
                    where: {
                        merchantId,
                        content: { contains: query, mode: 'insensitive' },
                    },
                    take: maxResults,
                });
                if (textResults && textResults.length > 0) {
                    chunks = textResults;
                }
            }
            catch { }
        }
        // Fallback 2: General top merchant chunks
        if (chunks.length === 0) {
            try {
                const fallbackChunks = await db_1.prisma.knowledgeChunk.findMany({
                    where: { merchantId },
                    take: maxResults,
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
