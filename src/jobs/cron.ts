import cron from 'node-cron';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { scrapeWebsite } from '../services/scraper.service';

// Run every day at 06:00 UTC (12:00 PM Bangladesh Standard Time)
export function initCronJobs() {
  logger.info('Initializing background cron jobs...');

  cron.schedule('0 6 * * *', async () => {
    logger.info('CRON: Starting daily deep crawl for all merchant domains...');
    
    try {
      // Fetch all merchants with allowed domains
      const merchants = await prisma.user.findMany({
        where: {
          allowedDomains: {
            isEmpty: false
          }
        },
        select: {
          id: true,
          allowedDomains: true
        }
      });

      for (const merchant of merchants) {
        for (const domain of merchant.allowedDomains) {
          try {
            logger.info(`CRON: Initiating scrape for merchant ${merchant.id} on domain ${domain}`);
            await scrapeWebsite(domain, merchant.id);
          } catch (err) {
            logger.error(`CRON: Failed to scrape domain ${domain} for merchant ${merchant.id}:`, err);
          }
        }
      }
      
      logger.info('CRON: Daily deep crawl completed.');
    } catch (error) {
      logger.error('CRON: Error fetching merchants for daily crawl:', error);
    }
  }, {
    timezone: 'UTC' // 06:00 UTC is 12:00 PM BST
  });
}
