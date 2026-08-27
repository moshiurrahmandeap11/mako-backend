"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProductsTool = searchProductsTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchProductsTool(merchantId, query, category, maxResults = 5, targetDomain) {
    try {
        const cleanDomain = targetDomain
            ? targetDomain
                .replace(/^https?:\/\//, "")
                .split("/")[0]
                .split(":")[0]
            : "";
        const domainFilter = cleanDomain ? `%${cleanDomain}%` : "";
        // 1. Generate query embedding
        const queryVector = await (0, embeddings_1.generateEmbedding)(query);
        let products = [];
        try {
            // Try pgvector cosine distance search
            const rawResults = await (0, db_1.executeRawNeonQuery)(`SELECT id, "externalId", title, description, price, currency, "imageUrl", "productUrl", category, "inStock", "options", "variants",
                (embedding <=> $1::vector) as distance
         FROM "Product"
         WHERE "merchantId" = $2 AND "inStock" = true
           AND ($4 = '' OR "productUrl" ILIKE $4)
         ORDER BY distance ASC
         LIMIT $3`, [queryVector, merchantId, maxResults, domainFilter]);
            if (rawResults && rawResults.length > 0) {
                products = rawResults;
            }
        }
        catch (e) {
            logger_1.logger.warn("pgvector search fallback to ILIKE text query:", e);
        }
        // Fallback: If vector search returns empty, perform multi-word tokenized search
        if (products.length === 0) {
            const words = query
                .toLowerCase()
                .replace(/[^a-zA-Z0-9\u0980-\u09FF\s]/g, " ")
                .split(/\s+/)
                .filter((w) => w.length >= 3);
            const orConditions = [
                { title: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { category: { contains: query, mode: "insensitive" } },
            ];
            for (const w of words) {
                orConditions.push({ title: { contains: w, mode: "insensitive" } });
                orConditions.push({
                    description: { contains: w, mode: "insensitive" },
                });
            }
            const whereConditions = {
                merchantId,
                inStock: true,
                OR: orConditions,
            };
            if (cleanDomain) {
                whereConditions.productUrl = {
                    contains: cleanDomain,
                    mode: "insensitive",
                };
            }
            products = await db_1.prisma.product.findMany({
                where: whereConditions,
                take: maxResults,
            });
        }
        return products.map((p) => ({
            id: p.id,
            externalId: p.externalId,
            title: p.title,
            description: p.description,
            price: Number(p.price),
            currency: p.currency || "USD",
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
            category: p.category,
            inStock: p.inStock,
            options: p.options || undefined,
            variants: p.variants || undefined,
        }));
    }
    catch (error) {
        logger_1.logger.error("Error in searchProductsTool:", error);
        return [];
    }
}
