"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKnowledgeTool = searchKnowledgeTool;
const db_1 = require("../../../config/db");
const embeddings_1 = require("../../../utils/embeddings");
const logger_1 = require("../../../utils/logger");
async function searchKnowledgeTool(merchantId, query, maxResults = 8, targetDomain) {
    try {
        let chunks = [];
        const domainFilter = targetDomain
            ? `%${targetDomain.replace(/^https?:\/\//, "").split("/")[0]}%`
            : "";
        // 1. Diverse Vector Similarity Search (Grouped & Partitioned by URL via local pgvector)
        try {
            const queryVector = await (0, embeddings_1.generateEmbedding)(query);
            const isRealVector = queryVector && queryVector.some((v) => v !== 0);
            if (isRealVector) {
                const vectorStr = `[${queryVector.join(",")}]`;
                const rawResults = await db_1.prisma.$queryRawUnsafe(`WITH RankedChunks AS (
             SELECT id, url, content, 
                    (embedding <=> $1::vector) as distance,
                    ROW_NUMBER() OVER (PARTITION BY url ORDER BY (embedding <=> $1::vector) ASC) as rank_per_url
             FROM "KnowledgeChunk"
             WHERE "merchantId" = $2 
               AND ($4 = '' OR url ILIKE $4 OR url ILIKE '%global%' OR url LIKE 'global://%' OR url LIKE 'doc:%' OR url LIKE 'custom-note%')
               AND embedding IS NOT NULL
           )
           SELECT id, url, content, distance
           FROM RankedChunks
           ORDER BY rank_per_url ASC, distance ASC
           LIMIT $3`, vectorStr, merchantId, maxResults, domainFilter);
                if (rawResults && rawResults.length > 0) {
                    chunks = rawResults;
                }
            }
        }
        catch (e) {
            logger_1.logger.error("Vector search error in searchKnowledgeTool:", e);
        }
        // 2. Keyword Search with Multi-URL Diversity Fallback
        if (chunks.length === 0) {
            try {
                const words = query
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, "")
                    .split(/\s+/)
                    .filter((w) => w.length >= 3);
                const whereConditions = { merchantId };
                if (domainFilter) {
                    const cleanDomain = domainFilter.replace(/%/g, "");
                    whereConditions.OR = [
                        { url: { contains: cleanDomain, mode: "insensitive" } },
                        { url: { contains: "global", mode: "insensitive" } },
                        { url: { startsWith: "global://" } },
                        { url: { startsWith: "doc:" } },
                        { url: { startsWith: "custom-note" } },
                    ];
                }
                if (words.length > 0) {
                    const wordConditions = words.map((w) => ({
                        content: { contains: w, mode: "insensitive" },
                    }));
                    if (whereConditions.OR) {
                        whereConditions.AND = [{ OR: wordConditions }];
                    }
                    else {
                        whereConditions.OR = wordConditions;
                    }
                }
                const textResults = await db_1.prisma.knowledgeChunk.findMany({
                    where: whereConditions,
                    take: maxResults * 2,
                    orderBy: { createdAt: "desc" },
                });
                if (textResults && textResults.length > 0) {
                    // Partition by URL to ensure multi-page diversity
                    const seenUrls = new Set();
                    const diverseResults = [];
                    for (const item of textResults) {
                        if (!seenUrls.has(item.url)) {
                            seenUrls.add(item.url);
                            diverseResults.push(item);
                            if (diverseResults.length >= maxResults)
                                break;
                        }
                    }
                    // If still space, fill with remaining items
                    for (const item of textResults) {
                        if (diverseResults.length >= maxResults)
                            break;
                        if (!diverseResults.includes(item)) {
                            diverseResults.push(item);
                        }
                    }
                    chunks = diverseResults;
                }
            }
            catch (err) {
                logger_1.logger.error("Keyword search error in searchKnowledgeTool:", err);
            }
        }
        // 3. Fallback: Fetch distinct merchant knowledge chunks across pages
        if (chunks.length === 0) {
            try {
                const whereConditions = { merchantId };
                if (domainFilter) {
                    const cleanDomain = domainFilter.replace(/%/g, "");
                    whereConditions.OR = [
                        { url: { contains: cleanDomain, mode: "insensitive" } },
                        { url: { contains: "global", mode: "insensitive" } },
                        { url: { startsWith: "global://" } },
                        { url: { startsWith: "doc:" } },
                        { url: { startsWith: "custom-note" } },
                    ];
                }
                const fallbackChunks = await db_1.prisma.knowledgeChunk.findMany({
                    where: whereConditions,
                    take: maxResults * 2,
                    orderBy: { createdAt: "desc" },
                });
                if (fallbackChunks && fallbackChunks.length > 0) {
                    const seenUrls = new Set();
                    const diverseFallback = [];
                    for (const c of fallbackChunks) {
                        if (!seenUrls.has(c.url)) {
                            seenUrls.add(c.url);
                            diverseFallback.push(c);
                            if (diverseFallback.length >= maxResults)
                                break;
                        }
                    }
                    chunks =
                        diverseFallback.length > 0
                            ? diverseFallback
                            : fallbackChunks.slice(0, maxResults);
                }
            }
            catch (err) {
                logger_1.logger.error("Failed fallback knowledgeChunk query:", err);
            }
        }
        return chunks.map((c) => ({
            url: c.url,
            content: c.content,
        }));
    }
    catch (error) {
        logger_1.logger.error("Error in searchKnowledgeTool:", error);
        return [];
    }
}
