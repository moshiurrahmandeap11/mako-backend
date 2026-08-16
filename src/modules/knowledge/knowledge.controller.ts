import { Response } from 'express';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { prisma } from '../../config/db';
import {
  scrapeWebsite,
  scrapeSingleUrl,
  addManualKnowledgeChunk,
} from '../../services/scraper.service';
import { logger } from '../../utils/logger';

/**
 * List all knowledge chunks and indexed sources for merchant
 */
export async function listKnowledge(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const chunks = await prisma.knowledgeChunk.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 150,
      select: {
        id: true,
        url: true,
        content: true,
        createdAt: true,
      },
    });

    // Extract unique source URLs and page stats
    const sourceMap = new Map<string, number>();
    for (const chunk of chunks) {
      const count = sourceMap.get(chunk.url) || 0;
      sourceMap.set(chunk.url, count + 1);
    }

    const sources = Array.from(sourceMap.entries()).map(([url, count]) => ({
      url,
      chunkCount: count,
    }));

    return res.json({
      totalChunks: chunks.length,
      totalPages: sources.length,
      sources,
      chunks,
    });
  } catch (error: any) {
    logger.error('Error listing knowledge chunks:', error);
    return res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
}

/**
 * Scrape a specific single URL on demand
 */
export async function scrapeUrl(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'A valid URL is required' });
    }

    logger.info(`Merchant ${merchantId} requested manual scrape of URL: ${url}`);
    const result = await scrapeSingleUrl(url, merchantId);

    return res.json({
      message: 'Successfully scraped and indexed URL',
      pageTitle: result.pageTitle,
      chunksCreated: result.chunksCount,
      productsIndexed: result.products.length,
    });
  } catch (error: any) {
    logger.error('Error scraping custom URL:', error);
    return res.status(500).json({ error: error.message || 'Failed to scrape URL' });
  }
}

/**
 * Add a manual custom text / FAQ note to knowledge base
 */
export async function addCustomKnowledge(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, content, sourceUrl } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const chunk = await addManualKnowledgeChunk(merchantId, title, content, sourceUrl);

    return res.json({
      message: 'Knowledge chunk added successfully',
      chunk: {
        id: chunk.id,
        url: chunk.url,
        content: chunk.content,
      },
    });
  } catch (error: any) {
    logger.error('Error adding custom knowledge:', error);
    return res.status(500).json({ error: 'Failed to add custom knowledge' });
  }
}

/**
 * Delete a specific knowledge chunk
 */
export async function deleteKnowledge(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Chunk ID is required' });
    }

    await prisma.knowledgeChunk.deleteMany({
      where: {
        id: String(id),
        merchantId,
      },
    });

    return res.json({ message: 'Knowledge chunk deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting knowledge chunk:', error);
    return res.status(500).json({ error: 'Failed to delete knowledge chunk' });
  }
}

/**
 * Trigger full re-crawl for merchant's primary domain
 */
export async function rescrapeAll(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: merchantId },
      select: { allowedDomains: true },
    });

    // Filter out localhost and 127.0.0.1 from allowedDomains to find the public domain
    const publicDomains = (user?.allowedDomains || []).filter((d: string) => {
      const clean = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      return clean && clean !== 'localhost' && clean !== '127.0.0.1' && clean !== '0.0.0.0';
    });

    const targetDomain = req.body.domain || publicDomains[0] || user?.allowedDomains?.[0];
    if (!targetDomain) {
      return res.status(400).json({ error: 'No valid public domain configured for this merchant' });
    }

    logger.info(`Merchant ${merchantId} triggered full rescrape of domain ${targetDomain}`);
    const result = await scrapeWebsite(targetDomain, merchantId);

    return res.json({
      message: 'Full domain crawl completed successfully',
      pagesCrawled: result.pagesCrawledCount,
      chunksCreated: result.knowledgeChunksCount,
      productsIndexed: result.indexedCount,
    });
  } catch (error: any) {
    logger.error('Error in full rescrape:', error);
    return res.status(500).json({ error: error.message || 'Failed to perform full rescrape' });
  }
}
