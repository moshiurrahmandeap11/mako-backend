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

  // Run every day at 09:00 UTC (03:00 PM BST) to evaluate monthly quotas and alert merchants
  cron.schedule('0 9 * * *', async () => {
    logger.info('CRON: Checking monthly message quotas for all merchants...');
    try {
      const PLAN_MONTHLY_LIMITS: Record<string, number> = {
        FREE: 100,
        STARTER: 500,
        PRO: 1500,
        ENTERPRISE: Infinity,
      };

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const merchants = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
          lastQuotaWarningEmailSentAt: true,
          lastQuotaExceededEmailSentAt: true,
        },
      });

      const { sendQuotaWarningEmail, sendQuotaExceededEmail } = await import('../utils/email');

      for (const m of merchants) {
        const limit = PLAN_MONTHLY_LIMITS[m.planTier] !== undefined ? PLAN_MONTHLY_LIMITS[m.planTier] : 100;
        if (limit === Infinity) continue;

        const count = await prisma.message.count({
          where: {
            conversation: { merchantId: m.id },
            createdAt: { gte: startOfMonth },
          },
        });

        const percentage = (count / limit) * 100;

        // 90% Warning
        if (percentage >= 90 && percentage < 100) {
          const needsWarning = !m.lastQuotaWarningEmailSentAt || m.lastQuotaWarningEmailSentAt < startOfMonth;
          if (needsWarning && m.email) {
            await sendQuotaWarningEmail({
              to: m.email,
              name: m.name,
              used: count,
              limit,
              tier: m.planTier,
            });
            await prisma.user.update({
              where: { id: m.id },
              data: { lastQuotaWarningEmailSentAt: new Date() },
            });
          }
        }

        // 100% Exceeded
        if (count >= limit) {
          const needsExceededAlert = !m.lastQuotaExceededEmailSentAt || m.lastQuotaExceededEmailSentAt < startOfMonth;
          if (needsExceededAlert && m.email) {
            await sendQuotaExceededEmail({
              to: m.email,
              name: m.name,
              used: count,
              limit,
              tier: m.planTier,
            });
            await prisma.user.update({
              where: { id: m.id },
              data: { lastQuotaExceededEmailSentAt: new Date() },
            });
          }
        }
      }

      logger.info('CRON: Quota evaluation completed.');
    } catch (error) {
      logger.error('CRON: Error during quota evaluation:', error);
    }
  }, {
    timezone: 'UTC'
  });
}
