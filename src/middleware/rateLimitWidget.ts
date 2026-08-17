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

    if (count >= limit) {
      logger.warn(`Merchant ${merchant.id} (${tier}) reached monthly limit of ${limit} messages.`);
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
