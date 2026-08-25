import cron from 'node-cron';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { scrapeWebsite } from '../services/scraper.service';
import { getPlanConfig, CREDITS_PER_MESSAGE } from '../config/pricing';

export function initCronJobs() {
  logger.info('Initializing background cron jobs...');

  // 1. Run every day at 06:00 UTC (12:00 PM BST) for domain indexing
  cron.schedule('0 6 * * *', async () => {
    logger.info('CRON: Starting daily deep crawl for all merchant domains...');
    
    try {
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
    timezone: 'UTC'
  });

  // 2. Monthly Credit Rollover Job (Runs on the 1st of every month at 00:05 UTC)
  cron.schedule('5 0 1 * *', async () => {
    logger.info('CRON: Executing monthly AI Smart Credit Rollover calculation...');
    try {
      // Calculate date range for previous month
      const now = new Date();
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

      const merchants = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          planTier: true,
          rolloverCredits: true,
        },
      });

      for (const m of merchants) {
        const plan = getPlanConfig(m.planTier);

        if (!plan.rolloverEnabled || m.planTier === 'FREE' || m.planTier === 'ENTERPRISE') {
          // Free plan resets rollover
          if (m.rolloverCredits > 0) {
            await prisma.user.update({
              where: { id: m.id },
              data: { rolloverCredits: 0 },
            });
          }
          continue;
        }

        // Count messages processed in previous month
        const prevMessagesCount = await prisma.message.count({
          where: {
            conversation: { merchantId: m.id },
            createdAt: {
              gte: prevMonthStart,
              lt: prevMonthEnd,
            },
          },
        });

        const prevUsedCredits = prevMessagesCount * CREDITS_PER_MESSAGE;
        const prevUnusedFromGrant = Math.max(0, plan.monthlyCredits - prevUsedCredits);

        // Cap maximum accumulated rollover at 100,000 credits to protect infrastructure
        const newRolloverBalance = Math.min(100000, (m.rolloverCredits || 0) + prevUnusedFromGrant);

        await prisma.user.update({
          where: { id: m.id },
          data: { rolloverCredits: newRolloverBalance },
        });

        logger.info(
          `CRON [Rollover]: Merchant ${m.email} (${m.planTier}) rolled over +${prevUnusedFromGrant} credits (New Rollover Bank: ${newRolloverBalance.toLocaleString()})`
        );
      }
      logger.info('CRON: Monthly Credit Rollover calculation finished.');
    } catch (err) {
      logger.error('CRON: Error in monthly credit rollover job:', err);
    }
  }, {
    timezone: 'UTC',
  });

  // 3. Run every day at 09:00 UTC (03:00 PM BST) to evaluate credit quotas and alert merchants
  cron.schedule('0 9 * * *', async () => {
    logger.info('CRON: Checking monthly AI Smart Credit quotas for all merchants...');
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const merchants = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
          createdAt: true,
          subscriptionStart: true,
          rolloverCredits: true,
          extraCredits: true,
          lastQuotaWarningEmailSentAt: true,
          lastQuotaExceededEmailSentAt: true,
        },
      });

      const { sendQuotaWarningEmail, sendQuotaExceededEmail } = await import('../utils/email');
      const { getBillingPeriodStart } = await import('../config/pricing');

      for (const m of merchants) {
        const plan = getPlanConfig(m.planTier);
        if (plan.monthlyCredits === Infinity || m.planTier === 'ENTERPRISE') continue;

        const cycleStart = getBillingPeriodStart({
          planTier: m.planTier,
          createdAt: m.createdAt,
          subscriptionStart: m.subscriptionStart,
        });

        const totalAllowedCredits = plan.monthlyCredits + (m.rolloverCredits || 0) + (m.extraCredits || 0);

        const count = await prisma.message.count({
          where: {
            conversation: { merchantId: m.id },
            ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
          },
        });

        const usedCredits = count * CREDITS_PER_MESSAGE;
        const percentage = totalAllowedCredits > 0 ? (usedCredits / totalAllowedCredits) * 100 : 100;
        const refDate = cycleStart || new Date(0);

        // 90% Warning
        if (percentage >= 90 && percentage < 100) {
          const needsWarning = !m.lastQuotaWarningEmailSentAt || m.lastQuotaWarningEmailSentAt < refDate;
          if (needsWarning && m.email) {
            await sendQuotaWarningEmail({
              to: m.email,
              name: m.name,
              used: usedCredits,
              limit: totalAllowedCredits,
              tier: m.planTier,
            });
            await prisma.user.update({
              where: { id: m.id },
              data: { lastQuotaWarningEmailSentAt: new Date() },
            });
          }
        }

        // 100% Exceeded
        if (usedCredits >= totalAllowedCredits) {
          const needsExceededAlert = !m.lastQuotaExceededEmailSentAt || m.lastQuotaExceededEmailSentAt < refDate;
          if (needsExceededAlert && m.email) {
            await sendQuotaExceededEmail({
              to: m.email,
              name: m.name,
              used: usedCredits,
              limit: totalAllowedCredits,
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
