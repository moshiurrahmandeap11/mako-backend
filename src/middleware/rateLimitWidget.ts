import { Response, NextFunction } from 'express';
import { WidgetAuthRequest } from './authenticateWidget';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  FREE: 100,
  STARTER: 500,
  PRO: 1500,
  ENTERPRISE: Infinity,
};

export async function rateLimitWidget(
  req: WidgetAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const merchant = req.merchant;
    if (!merchant) {
      res.status(401).json({ error: 'Unauthorized widget request.' });
      return;
    }

    const tier = merchant.planTier || 'FREE';
    const limit = PLAN_MONTHLY_LIMITS[tier] !== undefined ? PLAN_MONTHLY_LIMITS[tier] : 100;

    if (limit === Infinity) {
      return next();
    }

    // Get the start of the current month in UTC
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count all messages (user + assistant) processed for this merchant in the current calendar month
    const count = await prisma.message.count({
      where: {
        conversation: {
          merchantId: merchant.id,
        },
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    // Calculate percentage used
    const percentage = (count / limit) * 100;

    // Check if 90% quota warning email should be sent (only once per calendar month)
    if (percentage >= 90 && percentage < 100) {
      const dbMerchant = await prisma.user.findUnique({
        where: { id: merchant.id },
        select: { email: true, name: true, lastQuotaWarningEmailSentAt: true },
      });

      const needsWarning = !dbMerchant?.lastQuotaWarningEmailSentAt || dbMerchant.lastQuotaWarningEmailSentAt < startOfMonth;
      if (needsWarning && dbMerchant?.email) {
        const { sendQuotaWarningEmail } = await import('../utils/email');
        sendQuotaWarningEmail({
          to: dbMerchant.email,
          name: dbMerchant.name,
          used: count,
          limit,
          tier,
        }).catch((err) => logger.error('Failed to send quota warning email:', err));

        prisma.user.update({
          where: { id: merchant.id },
          data: { lastQuotaWarningEmailSentAt: new Date() },
        }).catch((err) => logger.error('Failed to update lastQuotaWarningEmailSentAt:', err));
      }
    }

    if (count >= limit) {
      logger.warn(`Merchant ${merchant.id} (${tier}) reached monthly limit of ${limit} messages.`);

      // Check if 100% quota exceeded email should be sent (only once per calendar month)
      const dbMerchant = await prisma.user.findUnique({
        where: { id: merchant.id },
        select: { email: true, name: true, lastQuotaExceededEmailSentAt: true },
      });

      const needsExceededAlert = !dbMerchant?.lastQuotaExceededEmailSentAt || dbMerchant.lastQuotaExceededEmailSentAt < startOfMonth;
      if (needsExceededAlert && dbMerchant?.email) {
        const { sendQuotaExceededEmail } = await import('../utils/email');
        sendQuotaExceededEmail({
          to: dbMerchant.email,
          name: dbMerchant.name,
          used: count,
          limit,
          tier,
        }).catch((err) => logger.error('Failed to send quota exceeded email:', err));

        prisma.user.update({
          where: { id: merchant.id },
          data: { lastQuotaExceededEmailSentAt: new Date() },
        }).catch((err) => logger.error('Failed to update lastQuotaExceededEmailSentAt:', err));
      }

      res.status(429).json({
        error: `Monthly message limit of ${limit} reached for your ${tier} plan. Please upgrade to continue using Labto AI.`,
        limit,
        count,
        upgradeRequired: true,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Widget rate limit check failed:', error);
    res.status(500).json({ error: 'Failed to verify rate limiting status.' });
  }
}
