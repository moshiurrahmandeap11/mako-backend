"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitWidget = rateLimitWidget;
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const PLAN_LIMITS = {
    FREE: 100,
    STARTER: 1000,
    PRO: 10000,
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
        const limit = PLAN_LIMITS[tier] !== undefined ? PLAN_LIMITS[tier] : 100;
        if (limit === Infinity) {
            return next();
        }
        // Get the start of today in UTC
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        // Count messages sent by this merchant's widget today
        const count = await db_1.prisma.message.count({
            where: {
                conversation: {
                    merchantId: merchant.id,
                },
                createdAt: {
                    gte: startOfDay,
                },
            },
        });
        if (count >= limit) {
            logger_1.logger.warn(`Merchant ${merchant.id} (${tier}) exceeded daily limit of ${limit} messages.`);
            res.status(429).json({
                error: `Daily message limit reached for the ${tier} plan. Please upgrade to continue using Labto AI.`,
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
