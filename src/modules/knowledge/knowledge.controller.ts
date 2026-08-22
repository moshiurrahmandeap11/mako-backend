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
 * Delete ALL knowledge chunks for merchant
 */
export async function deleteAllKnowledge(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.knowledgeChunk.deleteMany({
      where: { merchantId },
    });

    return res.json({ message: 'All knowledge chunks deleted successfully' });
  } catch (error: any) {
    logger.error('Error clearing all knowledge chunks:', error);
    return res.status(500).json({ error: 'Failed to clear knowledge base' });
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

    // Filter out localhost and 127.0.0.1 from allowedDomains to find public domains
    const publicDomains = (user?.allowedDomains || []).filter((d: string) => {
      const clean = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      return clean && clean !== 'localhost' && clean !== '127.0.0.1' && clean !== '0.0.0.0';
    });

    const domainsToCrawl = req.body.domain ? [req.body.domain] : publicDomains;

    if (domainsToCrawl.length === 0) {
      return res.status(400).json({ error: 'No valid public domains configured for this merchant' });
    }

    logger.info(`Merchant ${merchantId} triggered rescrape for domains: ${domainsToCrawl.join(', ')}`);

    let totalPagesCrawled = 0;
    let totalChunksCreated = 0;
    let totalProductsIndexed = 0;

    for (const domain of domainsToCrawl) {
      try {
        const result = await scrapeWebsite(domain, merchantId);
        totalPagesCrawled += result.pagesCrawledCount || 0;
        totalChunksCreated += result.knowledgeChunksCount || 0;
        totalProductsIndexed += result.indexedCount || 0;
      } catch (err) {
        logger.error(`Error crawling domain ${domain}:`, err);
      }
    }

    return res.json({
      message: 'Domain crawl completed successfully',
      domainsCrawled: domainsToCrawl.length,
      pagesCrawled: totalPagesCrawled,
      chunksCreated: totalChunksCreated,
      productsIndexed: totalProductsIndexed,
    });
  } catch (error: any) {
    logger.error('Error in full rescrape:', error);
    return res.status(500).json({ error: error.message || 'Failed to perform full rescrape' });
  }
}

/**
 * Get real-time background scrape status for merchant
 */
export async function getScrapeStatusHandler(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { getScrapeStatus } = await import('../../services/scraper.service');
    const status = getScrapeStatus(merchantId);
    return res.json({ status });
  } catch (error: any) {
    logger.error('Error fetching scrape status:', error);
    return res.status(500).json({ error: 'Failed to fetch background scrape status' });
  }
}

/**
 * Upload and index a document (PDF, DOCX, TXT, MD) into Knowledge Base
 */
export async function uploadDoc(req: DashboardAuthRequest, res: Response) {
  try {
    const merchantId = req.merchant?.id;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { filename, fileData, fileType, textContent } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    let extractedText = textContent || '';

    // If PDF base64 provided, parse with pdf-parse
    if (fileData && (fileType === 'pdf' || filename.endsWith('.pdf'))) {
      try {
        const pdfParse = require('pdf-parse');
        const base64Clean = fileData.replace(/^data:application\/pdf;base64,/, '').trim();
        const buffer = Buffer.from(base64Clean, 'base64');
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text || '';
      } catch (err: any) {
        logger.error('PDF parsing error:', err);
        return res.status(400).json({ error: `Failed to parse PDF document: ${err.message}` });
      }
    } else if (fileData && !extractedText) {
      // Plain text or base64 text fallback
      const base64Clean = fileData.replace(/^data:[^;]+;base64,/, '').trim();
      extractedText = Buffer.from(base64Clean, 'base64').toString('utf-8');
    }

    extractedText = (extractedText || '').trim();
    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({ error: 'Could not extract meaningful text from document.' });
    }

    // Split extracted text into semantic chunks (~500 chars)
    const rawParagraphs = extractedText.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of rawParagraphs) {
      const cleanPara = para.replace(/\s+/g, ' ').trim();
      if (!cleanPara) continue;

      if ((currentChunk + ' ' + cleanPara).length > 600) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = cleanPara;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + cleanPara;
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    const sourceUrl = `doc:${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { generateEmbedding } = await import('../../utils/embeddings');

    let createdCount = 0;
    for (const chunkText of chunks.slice(0, 100)) {
      const formatted = `# Document: ${filename}\nSource: ${sourceUrl}\n\n${chunkText}`;
      const chunkRecord = await prisma.knowledgeChunk.create({
        data: {
          merchantId,
          url: sourceUrl,
          content: formatted,
        },
      });

      try {
        const emb = await generateEmbedding(formatted);
        if (emb && emb.some((v) => v !== 0)) {
          await prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            `[${emb.join(',')}]`,
            chunkRecord.id
          );
        }
      } catch (embErr) {
        logger.warn('Failed to embed chunk for document:', embErr);
      }

      createdCount++;
    }

    return res.json({
      message: 'Document uploaded and indexed successfully',
      filename,
      chunksCreated: createdCount,
      sourceUrl,
    });
  } catch (error: any) {
    logger.error('Error uploading document:', error);
    return res.status(500).json({ error: error.message || 'Failed to process document' });
  }
}
