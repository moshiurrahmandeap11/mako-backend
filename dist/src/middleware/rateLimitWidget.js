"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
        // Calculate percentage used
        const percentage = (count / limit) * 100;
        // Check if 90% quota warning email should be sent (only once per calendar month)
        if (percentage >= 90 && percentage < 100) {
            const dbMerchant = await db_1.prisma.user.findUnique({
                where: { id: merchant.id },
                select: { email: true, name: true, lastQuotaWarningEmailSentAt: true },
            });
            const needsWarning = !dbMerchant?.lastQuotaWarningEmailSentAt || dbMerchant.lastQuotaWarningEmailSentAt < startOfMonth;
            if (needsWarning && dbMerchant?.email) {
                const { sendQuotaWarningEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
                sendQuotaWarningEmail({
                    to: dbMerchant.email,
                    name: dbMerchant.name,
                    used: count,
                    limit,
                    tier,
                }).catch((err) => logger_1.logger.error('Failed to send quota warning email:', err));
                db_1.prisma.user.update({
                    where: { id: merchant.id },
                    data: { lastQuotaWarningEmailSentAt: new Date() },
                }).catch((err) => logger_1.logger.error('Failed to update lastQuotaWarningEmailSentAt:', err));
            }
        }
        if (count >= limit) {
            logger_1.logger.warn(`Merchant ${merchant.id} (${tier}) reached monthly limit of ${limit} messages.`);
            // Check if 100% quota exceeded email should be sent (only once per calendar month)
            const dbMerchant = await db_1.prisma.user.findUnique({
                where: { id: merchant.id },
                select: { email: true, name: true, lastQuotaExceededEmailSentAt: true },
            });
            const needsExceededAlert = !dbMerchant?.lastQuotaExceededEmailSentAt || dbMerchant.lastQuotaExceededEmailSentAt < startOfMonth;
            if (needsExceededAlert && dbMerchant?.email) {
                const { sendQuotaExceededEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
                sendQuotaExceededEmail({
                    to: dbMerchant.email,
                    name: dbMerchant.name,
                    used: count,
                    limit,
                    tier,
                }).catch((err) => logger_1.logger.error('Failed to send quota exceeded email:', err));
                db_1.prisma.user.update({
                    where: { id: merchant.id },
                    data: { lastQuotaExceededEmailSentAt: new Date() },
                }).catch((err) => logger_1.logger.error('Failed to update lastQuotaExceededEmailSentAt:', err));
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
    }
    catch (error) {
        logger_1.logger.error('Widget rate limit check failed:', error);
        res.status(500).json({ error: 'Failed to verify rate limiting status.' });
    }
}
