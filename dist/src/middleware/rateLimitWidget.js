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
const pricing_1 = require("../config/pricing");
async function rateLimitWidget(req, res, next) {
    try {
        const merchant = req.merchant;
        if (!merchant) {
            res.status(401).json({ error: 'Unauthorized widget request.' });
            return;
        }
        const tier = merchant.planTier || 'FREE';
        const plan = (0, pricing_1.getPlanConfig)(tier);
        if (plan.monthlyCredits === Infinity || tier === 'ENTERPRISE') {
            return next();
        }
        // Fetch user details with rollover, extra credits & billing dates
        const dbMerchant = await db_1.prisma.user.findUnique({
            where: { id: merchant.id },
            select: {
                email: true,
                name: true,
                createdAt: true,
                subscriptionStart: true,
                rolloverCredits: true,
                extraCredits: true,
                lastQuotaWarningEmailSentAt: true,
                lastQuotaExceededEmailSentAt: true,
            },
        });
        const cycleStart = (0, pricing_1.getBillingPeriodStart)({
            planTier: tier,
            createdAt: dbMerchant?.createdAt,
            subscriptionStart: dbMerchant?.subscriptionStart,
        });
        const totalAllowedCredits = plan.monthlyCredits + (dbMerchant?.rolloverCredits || 0) + (dbMerchant?.extraCredits || 0);
        // Count messages: For FREE plan (cycleStart === null) count lifetime messages, for paid plans count from cycleStart
        const messageCount = await db_1.prisma.message.count({
            where: {
                conversation: {
                    merchantId: merchant.id,
                },
                ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
            },
        });
        const usedCredits = messageCount * pricing_1.CREDITS_PER_MESSAGE;
        const percentage = totalAllowedCredits > 0 ? (usedCredits / totalAllowedCredits) * 100 : 100;
        const refDate = cycleStart || new Date(0);
        // Check if 90% quota warning email should be sent
        if (percentage >= 90 && percentage < 100) {
            const needsWarning = !dbMerchant?.lastQuotaWarningEmailSentAt || dbMerchant.lastQuotaWarningEmailSentAt < refDate;
            if (needsWarning && dbMerchant?.email) {
                const { sendQuotaWarningEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
                sendQuotaWarningEmail({
                    to: dbMerchant.email,
                    name: dbMerchant.name,
                    used: usedCredits,
                    limit: totalAllowedCredits,
                    tier,
                }).catch((err) => logger_1.logger.error('Failed to send quota warning email:', err));
                db_1.prisma.user
                    .update({
                    where: { id: merchant.id },
                    data: { lastQuotaWarningEmailSentAt: new Date() },
                })
                    .catch((err) => logger_1.logger.error('Failed to update lastQuotaWarningEmailSentAt:', err));
            }
        }
        if (usedCredits >= totalAllowedCredits) {
            logger_1.logger.warn(`Merchant ${merchant.id} (${tier}) exhausted total available credits (${usedCredits}/${totalAllowedCredits}).`);
            // Check if 100% quota exceeded email should be sent
            const needsExceededAlert = !dbMerchant?.lastQuotaExceededEmailSentAt || dbMerchant.lastQuotaExceededEmailSentAt < refDate;
            if (needsExceededAlert && dbMerchant?.email) {
                const { sendQuotaExceededEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
                sendQuotaExceededEmail({
                    to: dbMerchant.email,
                    name: dbMerchant.name,
                    used: usedCredits,
                    limit: totalAllowedCredits,
                    tier,
                }).catch((err) => logger_1.logger.error('Failed to send quota exceeded email:', err));
                db_1.prisma.user
                    .update({
                    where: { id: merchant.id },
                    data: { lastQuotaExceededEmailSentAt: new Date() },
                })
                    .catch((err) => logger_1.logger.error('Failed to update lastQuotaExceededEmailSentAt:', err));
            }
            res.status(429).json({
                error: tier === 'FREE'
                    ? 'Assistant is currently offline due to credit quota limit.'
                    : `AI Credit limit of ${totalAllowedCredits.toLocaleString()} credits reached for your plan.`,
                limit: totalAllowedCredits,
                used: usedCredits,
                creditsRemaining: 0,
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
