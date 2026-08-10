"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProductsTool = searchProductsTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchProductsTool(merchantId, query, category, maxResults = 5) {
    try {
        // 1. Generate query embedding
        const queryVector = await (0, embeddings_1.generateEmbedding)(query);
        // Check if any product has non-zero embedding
        let products = [];
        try {
            // Try pgvector cosine distance search
            const rawResults = await (0, db_1.executeRawNeonQuery)(`SELECT id, "externalId", title, description, price, currency, "imageUrl", "productUrl", category, "inStock",
                (embedding <=> $1::vector) as distance
         FROM "Product"
         WHERE "merchantId" = $2 AND "inStock" = true
         ORDER BY distance ASC
         LIMIT $3`, [queryVector, merchantId, maxResults]);
            if (rawResults && rawResults.length > 0) {
                products = rawResults;
            }
        }
        catch (e) {
            logger_1.logger.warn('pgvector search fallback to ILIKE text query:', e);
        }
        // Fallback: If vector search returns empty (e.g. no embeddings generated yet), perform ILIKE search
        if (products.length === 0) {
            products = await db_1.prisma.product.findMany({
                where: {
                    merchantId,
                    inStock: true,
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                        { category: { contains: query, mode: 'insensitive' } },
                    ],
                },
                take: maxResults,
            });
        }
        return products.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            price: Number(p.price),
            currency: p.currency || 'USD',
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
            category: p.category,
            inStock: p.inStock,
        }));
    }
    catch (error) {
        logger_1.logger.error('Error in searchProductsTool:', error);
        return [];
    }
}
