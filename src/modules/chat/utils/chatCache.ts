/**
 * High-Speed In-Memory Cache for frequent queries & FAQs (1-hour TTL)
 */

interface CachedResponse {
  reply: string;
  thoughts: string[];
  products: any[];
  timestamp: number;
}

const queryResponseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCachedResponse(
  merchantId: string,
  userMessage: string,
): CachedResponse | null {
  const normalizedQuery = (userMessage || "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,]/g, "");
  if (!normalizedQuery) return null;

  const cacheKey = `${merchantId}:${normalizedQuery}`;
  const cached = queryResponseCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }
  return null;
}

export function setCachedResponse(
  merchantId: string,
  userMessage: string,
  reply: string,
  thoughts: string[],
  products: any[],
): void {
  const normalizedQuery = (userMessage || "")
    .trim()
    .toLowerCase()
    .replace(/[?!.,]/g, "");
  if (!normalizedQuery || !reply || reply.length >= 500) return;

  const cacheKey = `${merchantId}:${normalizedQuery}`;
  queryResponseCache.set(cacheKey, {
    reply,
    thoughts: thoughts.slice(0, 2),
    products: products.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      title: p.title,
      price: p.price,
      currency: p.currency || "USD",
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      inStock: p.inStock,
      options: p.options,
      variants: p.variants,
    })),
    timestamp: Date.now(),
  });
}
