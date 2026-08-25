import { prisma, executeRawNeonQuery } from '../../../config/db';
import { generateEmbedding } from '../../../utils/embeddings';
import { logger } from '../../../utils/logger';

export async function searchProductsTool(
  merchantId: string,
  query: string,
  category?: string,
  maxResults: number = 5
) {
  try {
    // 1. Generate query embedding
    const queryVector = await generateEmbedding(query);

    let products: any[] = [];

    try {
      // Try pgvector cosine distance search
      const rawResults = await executeRawNeonQuery(
        `SELECT id, "externalId", title, description, price, currency, "imageUrl", "productUrl", category, "inStock", "options", "variants",
                (embedding <=> $1::vector) as distance
         FROM "Product"
         WHERE "merchantId" = $2 AND "inStock" = true
         ORDER BY distance ASC
         LIMIT $3`,
        [queryVector, merchantId, maxResults]
      );

      if (rawResults && rawResults.length > 0) {
        products = rawResults;
      }
    } catch (e) {
      logger.warn('pgvector search fallback to ILIKE text query:', e);
    }

    // Fallback: If vector search returns empty, perform multi-word tokenized search
    if (products.length === 0) {
      const words = query
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\u0980-\u09FF\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      const orConditions: any[] = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
      ];

      for (const w of words) {
        orConditions.push({ title: { contains: w, mode: 'insensitive' } });
        orConditions.push({ description: { contains: w, mode: 'insensitive' } });
      }

      products = await prisma.product.findMany({
        where: {
          merchantId,
          inStock: true,
          OR: orConditions,
        },
        take: maxResults,
      });
    }

    return products.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      title: p.title,
      description: p.description,
      price: Number(p.price),
      currency: p.currency || 'USD',
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      category: p.category,
      inStock: p.inStock,
      options: p.options || undefined,
      variants: p.variants || undefined,
    }));
  } catch (error) {
    logger.error('Error in searchProductsTool:', error);
    return [];
  }
}
