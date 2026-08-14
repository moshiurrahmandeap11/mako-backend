"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKnowledgeTool = searchKnowledgeTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchKnowledgeTool(merchantId, query, maxResults = 3) {
    try {
        const queryVector = await (0, embeddings_1.generateEmbedding)(query);
        let chunks = [];
        try {
            const rawResults = await (0, db_1.executeRawNeonQuery)(`SELECT id, url, content, 
                (embedding <=> $1::vector) as distance
         FROM "KnowledgeChunk"
         WHERE "merchantId" = $2
         ORDER BY distance ASC
         LIMIT $3`, [queryVector, merchantId, maxResults]);
            if (rawResults && rawResults.length > 0) {
                chunks = rawResults;
            }
        }
        catch (e) {
            logger_1.logger.error('Failed to search KnowledgeChunk vectors:', e);
        }
        // Fallback: If vector search returns 0 chunks, fetch top scraped knowledge chunks
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
