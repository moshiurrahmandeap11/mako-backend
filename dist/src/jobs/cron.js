"use strict";
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
}
