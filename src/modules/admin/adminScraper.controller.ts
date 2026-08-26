import { Response } from 'express';
import { prisma } from '../../config/db';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { triggerBackgroundCrawl, getScrapeStatus } from '../../services/scraper.service';
import { logger } from '../../utils/logger';

export async function getAdminScraperOverview(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const [totalChunks, merchantsWithDomains] = await Promise.all([
      prisma.knowledgeChunk.count(),
      prisma.user.findMany({
        where: { allowedDomains: { isEmpty: false } },
        select: {
          id: true,
          name: true,
          email: true,
          allowedDomains: true,
          _count: { select: { knowledgeChunks: true, products: true } },
        },
        take: 30,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const activeCrawls = merchantsWithDomains.map((m) => {
      const status = getScrapeStatus(m.id);
      return {
        merchantId: m.id,
        merchantName: m.name,
        merchantEmail: m.email,
        domains: m.allowedDomains,
        chunksCount: m._count.knowledgeChunks,
        productsCount: m._count.products,
        crawlStatus: status,
      };
    });

    res.json({
      totalChunks,
      monitoredDomainsCount: merchantsWithDomains.length,
      merchants: activeCrawls,
    });
  } catch (error) {
    logger.error('Admin Scraper Overview Error:', error);
    res.status(500).json({ error: 'Failed to fetch scraper overview.' });
  }
}

export async function triggerAdminForceScrape(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { merchantId, domain } = req.body;

    if (!merchantId || !domain) {
      res.status(400).json({ error: 'merchantId and domain are required.' });
      return;
    }

    const merchant = await prisma.user.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }

    const result = triggerBackgroundCrawl(domain, merchantId);
    logger.info(`[Admin] Force crawl triggered for merchant ${merchantId} on ${domain}`);

    res.json({
      success: true,
      message: `Crawl initiated for ${domain}`,
      result,
    });
  } catch (error) {
    logger.error('Admin Force Scrape Error:', error);
    res.status(500).json({ error: 'Failed to trigger scrape.' });
  }
}
