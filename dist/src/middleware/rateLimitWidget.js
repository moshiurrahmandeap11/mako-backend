"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitWidget = rateLimitWidget;
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const PLAN_MONTHLY_LIMITS = {
    FREE: 100,
    STARTER: 500,
    PRO: 1500,
    ENTERPRISE: Infinity,
};
async function rateLimitWidget(req, res, next) {
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
        const count = await db_1.prisma.message.count({
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
            logger_1.logger.warn(`Merchant ${merchant.id} (${tier}) reached monthly limit of ${limit} messages.`);
            res.status(429).json({
                error: `Monthly message limit of ${limit} reached for your ${tier} plan. Please upgrade to continue using Labto AI.`,
                limit,
                count,
                upgradeRequired: true,
            });
            return;
        }
        next();
    }
    catch (error) {
        logger_1.logger.error('Widget rate limit check failed:', error);
        res.status(500).json({ error: 'Failed to verify rate limiting status.' });
    }
}
