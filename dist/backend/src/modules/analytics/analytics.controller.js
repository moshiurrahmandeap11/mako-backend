"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSummary = getSummary;
exports.listConversations = listConversations;
const db_1 = require("../../config/db");
const logger_1 = require("../../utils/logger");
async function getSummary(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const [totalProducts, totalConversations, totalApiKeys, totalMessages] = await Promise.all([
            db_1.prisma.product.count({ where: { merchantId } }),
            db_1.prisma.conversation.count({ where: { merchantId } }),
            db_1.prisma.apiKey.count({ where: { merchantId, isActive: true } }),
            db_1.prisma.message.count({ where: { conversation: { merchantId } } }),
        ]);
        res.json({
            summary: {
                totalProducts,
                totalConversations,
                totalApiKeys,
                totalMessages,
                planTier: req.merchant?.planTier,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Get Analytics Summary Error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics summary.' });
    }
}
async function listConversations(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '15', 10);
        const skip = (page - 1) * limit;
        const [conversations, total] = await Promise.all([
            db_1.prisma.conversation.findMany({
                where: { merchantId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            }),
            db_1.prisma.conversation.count({ where: { merchantId } }),
        ]);
        res.json({
            conversations,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        logger_1.logger.error('List Conversations Error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation logs.' });
    }
}
