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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobs = initCronJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const scraper_service_1 = require("../services/scraper.service");
const pricing_1 = require("../config/pricing");
function initCronJobs() {
    logger_1.logger.info('Initializing background cron jobs...');
    // 1. Run every day at 06:00 UTC (12:00 PM BST) for domain indexing
    node_cron_1.default.schedule('0 6 * * *', async () => {
        logger_1.logger.info('CRON: Starting daily deep crawl for all merchant domains...');
        try {
            const merchants = await db_1.prisma.user.findMany({
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
                        logger_1.logger.info(`CRON: Initiating scrape for merchant ${merchant.id} on domain ${domain}`);
                        await (0, scraper_service_1.scrapeWebsite)(domain, merchant.id);
                    }
                    catch (err) {
                        logger_1.logger.error(`CRON: Failed to scrape domain ${domain} for merchant ${merchant.id}:`, err);
                    }
                }
            }
            logger_1.logger.info('CRON: Daily deep crawl completed.');
        }
        catch (error) {
            logger_1.logger.error('CRON: Error fetching merchants for daily crawl:', error);
        }
    }, {
        timezone: 'UTC'
    });
    // 2. Monthly Credit Rollover Job (Runs on the 1st of every month at 00:05 UTC)
    node_cron_1.default.schedule('5 0 1 * *', async () => {
        logger_1.logger.info('CRON: Executing monthly AI Smart Credit Rollover calculation...');
        try {
            // Calculate date range for previous month
            const now = new Date();
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
            const merchants = await db_1.prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    planTier: true,
                    rolloverCredits: true,
                },
            });
            for (const m of merchants) {
                const plan = (0, pricing_1.getPlanConfig)(m.planTier);
                if (!plan.rolloverEnabled || m.planTier === 'FREE' || m.planTier === 'ENTERPRISE') {
                    // Free plan resets rollover
                    if (m.rolloverCredits > 0) {
                        await db_1.prisma.user.update({
                            where: { id: m.id },
                            data: { rolloverCredits: 0 },
                        });
                    }
                    continue;
                }
                // Count messages processed in previous month
                const prevMessagesCount = await db_1.prisma.message.count({
                    where: {
                        conversation: { merchantId: m.id },
                        createdAt: {
                            gte: prevMonthStart,
                            lt: prevMonthEnd,
                        },
                    },
                });
                const prevUsedCredits = prevMessagesCount * pricing_1.CREDITS_PER_MESSAGE;
                const prevUnusedFromGrant = Math.max(0, plan.monthlyCredits - prevUsedCredits);
                // Cap maximum accumulated rollover at 100,000 credits to protect infrastructure
                const newRolloverBalance = Math.min(100000, (m.rolloverCredits || 0) + prevUnusedFromGrant);
                await db_1.prisma.user.update({
                    where: { id: m.id },
                    data: { rolloverCredits: newRolloverBalance },
                });
                logger_1.logger.info(`CRON [Rollover]: Merchant ${m.email} (${m.planTier}) rolled over +${prevUnusedFromGrant} credits (New Rollover Bank: ${newRolloverBalance.toLocaleString()})`);
            }
            logger_1.logger.info('CRON: Monthly Credit Rollover calculation finished.');
        }
        catch (err) {
            logger_1.logger.error('CRON: Error in monthly credit rollover job:', err);
        }
    }, {
        timezone: 'UTC',
    });
    // 3. Run every day at 09:00 UTC (03:00 PM BST) to evaluate credit quotas and alert merchants
    node_cron_1.default.schedule('0 9 * * *', async () => {
        logger_1.logger.info('CRON: Checking monthly AI Smart Credit quotas for all merchants...');
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const merchants = await db_1.prisma.user.findMany({
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
            const { sendQuotaWarningEmail, sendQuotaExceededEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
            const { getBillingPeriodStart } = await Promise.resolve().then(() => __importStar(require('../config/pricing')));
            for (const m of merchants) {
                const plan = (0, pricing_1.getPlanConfig)(m.planTier);
                if (plan.monthlyCredits === Infinity || m.planTier === 'ENTERPRISE')
                    continue;
                const cycleStart = getBillingPeriodStart({
                    planTier: m.planTier,
                    createdAt: m.createdAt,
                    subscriptionStart: m.subscriptionStart,
                });
                const totalAllowedCredits = plan.monthlyCredits + (m.rolloverCredits || 0) + (m.extraCredits || 0);
                const count = await db_1.prisma.message.count({
                    where: {
                        conversation: { merchantId: m.id },
                        ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
                    },
                });
                const usedCredits = count * pricing_1.CREDITS_PER_MESSAGE;
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
                        await db_1.prisma.user.update({
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
                        await db_1.prisma.user.update({
                            where: { id: m.id },
                            data: { lastQuotaExceededEmailSentAt: new Date() },
                        });
                    }
                }
            }
            logger_1.logger.info('CRON: Quota evaluation completed.');
        }
        catch (error) {
            logger_1.logger.error('CRON: Error during quota evaluation:', error);
        }
    }, {
        timezone: 'UTC'
    });
}
