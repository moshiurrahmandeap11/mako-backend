import { Response, NextFunction } from 'express';
import { WidgetAuthRequest } from './authenticateWidget';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';
import { getPlanConfig, CREDITS_PER_MESSAGE } from '../config/pricing';

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
    const plan = getPlanConfig(tier);

    if (plan.monthlyCredits === Infinity || tier === 'ENTERPRISE') {
      return next();
    }

    // Get the start of the current month in UTC
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Fetch user details with rollover & extra credits
    const dbMerchant = await prisma.user.findUnique({
      where: { id: merchant.id },
      select: {
        email: true,
        name: true,
        rolloverCredits: true,
        extraCredits: true,
        lastQuotaWarningEmailSentAt: true,
        lastQuotaExceededEmailSentAt: true,
      },
    });

    const totalAllowedCredits = plan.monthlyCredits + (dbMerchant?.rolloverCredits || 0) + (dbMerchant?.extraCredits || 0);

    // Count all messages processed for this merchant in the current calendar month
    const messageCount = await prisma.message.count({
      where: {
        conversation: {
          merchantId: merchant.id,
        },
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    const usedCredits = messageCount * CREDITS_PER_MESSAGE;
    const percentage = totalAllowedCredits > 0 ? (usedCredits / totalAllowedCredits) * 100 : 100;

    // Check if 90% quota warning email should be sent (only once per calendar month)
    if (percentage >= 90 && percentage < 100) {
      const needsWarning =
        !dbMerchant?.lastQuotaWarningEmailSentAt || dbMerchant.lastQuotaWarningEmailSentAt < startOfMonth;
      if (needsWarning && dbMerchant?.email) {
        const { sendQuotaWarningEmail } = await import('../utils/email');
        sendQuotaWarningEmail({
          to: dbMerchant.email,
          name: dbMerchant.name,
          used: usedCredits,
          limit: totalAllowedCredits,
          tier,
        }).catch((err) => logger.error('Failed to send quota warning email:', err));

        prisma.user
          .update({
            where: { id: merchant.id },
            data: { lastQuotaWarningEmailSentAt: new Date() },
          })
          .catch((err) => logger.error('Failed to update lastQuotaWarningEmailSentAt:', err));
      }
    }

    if (usedCredits >= totalAllowedCredits) {
      logger.warn(
        `Merchant ${merchant.id} (${tier}) exhausted total available credits (${usedCredits}/${totalAllowedCredits}).`
      );

      // Check if 100% quota exceeded email should be sent (only once per calendar month)
      const needsExceededAlert =
        !dbMerchant?.lastQuotaExceededEmailSentAt || dbMerchant.lastQuotaExceededEmailSentAt < startOfMonth;
      if (needsExceededAlert && dbMerchant?.email) {
        const { sendQuotaExceededEmail } = await import('../utils/email');
        sendQuotaExceededEmail({
          to: dbMerchant.email,
          name: dbMerchant.name,
          used: usedCredits,
          limit: totalAllowedCredits,
          tier,
        }).catch((err) => logger.error('Failed to send quota exceeded email:', err));

        prisma.user
          .update({
            where: { id: merchant.id },
            data: { lastQuotaExceededEmailSentAt: new Date() },
          })
          .catch((err) => logger.error('Failed to update lastQuotaExceededEmailSentAt:', err));
      }

      res.status(429).json({
        error: `Monthly AI Smart Credit limit of ${totalAllowedCredits.toLocaleString()} credits reached for your ${tier} plan. Please upgrade to continue using Labto AI.`,
        limit: totalAllowedCredits,
        used: usedCredits,
        creditsRemaining: 0,
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
