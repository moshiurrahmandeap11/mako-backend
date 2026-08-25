"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSummary = getSummary;
exports.listConversations = listConversations;
exports.exportConversationPdf = exportConversationPdf;
const db_1 = require("../../config/db");
const logger_1 = require("../../utils/logger");
const pricing_1 = require("../../config/pricing");
async function getSummary(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const planTier = req.merchant?.planTier || 'FREE';
        const plan = (0, pricing_1.getPlanConfig)(planTier);
        const dbUser = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
            select: {
                createdAt: true,
                subscriptionStart: true,
                rolloverCredits: true,
                extraCredits: true,
            },
        });
        const cycleStart = (0, pricing_1.getBillingPeriodStart)({
            planTier,
            createdAt: dbUser?.createdAt,
            subscriptionStart: dbUser?.subscriptionStart,
        });
        const [totalProducts, totalConversations, totalApiKeys, totalMessages, currentCycleMessages, totalUniqueVisitors, visitorCountriesRaw,] = await Promise.all([
            db_1.prisma.product.count({ where: { merchantId } }),
            db_1.prisma.conversation.count({
                where: {
                    merchantId,
                    messages: {
                        some: {},
                    },
                },
            }),
            db_1.prisma.apiKey.count({ where: { merchantId, isActive: true } }),
            db_1.prisma.message.count({ where: { conversation: { merchantId } } }),
            db_1.prisma.message.count({
                where: {
                    conversation: { merchantId },
                    ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
                },
            }),
            db_1.prisma.visitor.count({ where: { merchantId } }),
            db_1.prisma.visitor.groupBy({
                by: ['country', 'countryCode'],
                where: { merchantId },
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 6,
            }),
        ]);
        const visitorCountries = visitorCountriesRaw.map((v) => ({
            country: v.country,
            countryCode: v.countryCode,
            count: v._count.id,
        }));
        const rolloverCredits = dbUser?.rolloverCredits || 0;
        const extraCredits = dbUser?.extraCredits || 0;
        const totalAllowedCredits = plan.monthlyCredits === Infinity
            ? 999999999
            : plan.monthlyCredits + rolloverCredits + extraCredits;
        const creditsUsedThisCycle = (cycleStart ? currentCycleMessages : totalMessages) * pricing_1.CREDITS_PER_MESSAGE;
        const creditsRemaining = Math.max(0, totalAllowedCredits - creditsUsedThisCycle);
        res.json({
            summary: {
                totalProducts,
                totalConversations,
                totalApiKeys,
                totalMessages,
                currentMonthMessages: currentCycleMessages,
                totalUniqueVisitors,
                visitorCountries,
                planTier,
                credits: {
                    planMonthlyGrant: plan.monthlyCredits,
                    rolloverCredits,
                    extraCredits,
                    totalAllowedCredits,
                    creditsUsedThisMonth: creditsUsedThisCycle,
                    creditsRemaining,
                    rolloverEnabled: plan.rolloverEnabled,
                    creditsPerMessage: pricing_1.CREDITS_PER_MESSAGE,
                },
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
                where: {
                    merchantId,
                    messages: {
                        some: {},
                    },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            }),
            db_1.prisma.conversation.count({
                where: {
                    merchantId,
                    messages: {
                        some: {},
                    },
                },
            }),
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
async function exportConversationPdf(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const sessionId = String(req.params.sessionId || '');
        if (!sessionId) {
            res.status(400).json({ error: 'Session ID is required.' });
            return;
        }
        // Verify conversation belongs strictly to this merchant (Data Leak Prevention)
        const conversation = await db_1.prisma.conversation.findFirst({
            where: {
                sessionId,
                merchantId,
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!conversation) {
            res.status(404).json({ error: 'Conversation session not found or unauthorized access.' });
            return;
        }
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const reqOrigin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="conversation_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf"`);
        doc.pipe(res);
        // Title & Header
        doc.fillColor('#0f172a').fontSize(18).text('Labto AI Assistant - Session Transcript', { align: 'center' });
        doc.moveDown(0.3);
        doc.fillColor('#475569').fontSize(10).text(`Merchant Account: ${req.merchant?.name || 'Authorized Merchant'}`, { align: 'center' });
        doc.fillColor('#64748b').fontSize(9).text(`Session ID: ${sessionId}  |  Exported: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(0.8);
        // Divider Line
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
        doc.moveDown(0.8);
        // Render Messages Feed
        if (!conversation.messages || conversation.messages.length === 0) {
            doc.fillColor('#94a3b8').fontSize(10).text('No messages recorded for this session.', { align: 'center' });
        }
        else {
            for (const msg of conversation.messages) {
                const isUser = msg.role === 'user';
                const roleLabel = isUser ? 'VISITOR' : 'AI ASSISTANT';
                const headerColor = isUser ? '#d97706' : '#0284c7';
                const timeStr = new Date(msg.createdAt).toLocaleString();
                doc.fillColor(headerColor).fontSize(10).text(`${roleLabel}  (${timeStr})`);
                doc.moveDown(0.2);
                // Sanitize ASCII/Latin text for standard PDFKit fonts
                const rawContent = msg.content || '';
                const cleanContent = rawContent
                    .replace(/[^\x00-\x7F]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                doc.fillColor('#1e293b').fontSize(9.5).text(cleanContent || rawContent.substring(0, 100) || '[Attachment / Action]');
                doc.moveDown(0.6);
            }
        }
        doc.moveDown(1.5);
        doc.fillColor('#94a3b8').fontSize(8).text('Generated securely via Labto AI Analytics Engine. Confidentially exported for research.', { align: 'center' });
        doc.end();
    }
    catch (error) {
        logger_1.logger.error('Export Conversation PDF Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF export.' });
        }
    }
}
