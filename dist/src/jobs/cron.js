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
// Run every day at 06:00 UTC (12:00 PM Bangladesh Standard Time)
function initCronJobs() {
    logger_1.logger.info('Initializing background cron jobs...');
    node_cron_1.default.schedule('0 6 * * *', async () => {
        logger_1.logger.info('CRON: Starting daily deep crawl for all merchant domains...');
        try {
            // Fetch all merchants with allowed domains
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
        timezone: 'UTC' // 06:00 UTC is 12:00 PM BST
    });
    // Run every day at 09:00 UTC (03:00 PM BST) to evaluate monthly quotas and alert merchants
    node_cron_1.default.schedule('0 9 * * *', async () => {
        logger_1.logger.info('CRON: Checking monthly message quotas for all merchants...');
        try {
            const PLAN_MONTHLY_LIMITS = {
                FREE: 100,
                STARTER: 500,
                PRO: 1500,
                ENTERPRISE: Infinity,
            };
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const merchants = await db_1.prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    planTier: true,
                    lastQuotaWarningEmailSentAt: true,
                    lastQuotaExceededEmailSentAt: true,
                },
            });
            const { sendQuotaWarningEmail, sendQuotaExceededEmail } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
            for (const m of merchants) {
                const limit = PLAN_MONTHLY_LIMITS[m.planTier] !== undefined ? PLAN_MONTHLY_LIMITS[m.planTier] : 100;
                if (limit === Infinity)
                    continue;
                const count = await db_1.prisma.message.count({
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
                        await db_1.prisma.user.update({
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
