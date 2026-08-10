"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.getWidgetConfigPublic = getWidgetConfigPublic;
exports.chat = chat;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../../config/db");
const chat_service_1 = require("./chat.service");
const logger_1 = require("../../utils/logger");
async function createSession(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const sessionId = `sess_${crypto_1.default.randomBytes(16).toString('hex')}`;
        await db_1.prisma.conversation.create({
            data: {
                merchantId,
                sessionId,
            },
        });
        res.json({ sessionId });
    }
    catch (error) {
        logger_1.logger.error('Create Widget Session Error:', error);
        res.status(500).json({ error: 'Failed to create widget session.' });
    }
}
async function getWidgetConfigPublic(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const planTier = req.merchant?.planTier || 'FREE';
        const isFree = planTier === 'FREE';
        let config = await db_1.prisma.widgetConfig.findUnique({
            where: { merchantId },
        });
        if (!config) {
            config = {
                id: '',
                merchantId,
                primaryColor: '#111111',
                greetingMessage: 'Hi! How can I help you shop today?',
                botName: 'Shop Assistant',
                position: 'bottom-right',
                addToCartEnabled: true,
            };
        }
        res.json({
            primaryColor: config.primaryColor || '#111111',
            greetingMessage: config.greetingMessage || 'Hi! How can I help you shop today?',
            botName: config.botName || 'Shop Assistant',
            position: config.position || 'bottom-right',
            addToCartEnabled: config.addToCartEnabled !== undefined ? config.addToCartEnabled : true,
            hideBranding: planTier === 'PRO' || planTier === 'ENTERPRISE',
            eventBridgeEnabled: planTier === 'PRO' || planTier === 'ENTERPRISE',
        });
    }
    catch (error) {
        logger_1.logger.error('Get Public Widget Config Error:', error);
        res.status(500).json({ error: 'Failed to fetch widget configuration.' });
    }
}
async function chat(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { sessionId, message, botMode, provider } = req.body;
        if (!message || typeof message !== 'string') {
            res.status(400).json({ error: 'Message field is required.' });
            return;
        }
        const effectiveSessionId = sessionId || `sess_${crypto_1.default.randomBytes(16).toString('hex')}`;
        const response = await (0, chat_service_1.processChatMessage)(merchantId, effectiveSessionId, message.trim(), botMode, provider, req.apiKeyRecord?.systemPrompt, req.apiKeyRecord?.template);
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Widget Chat API Error:', error);
        res.status(500).json({ error: 'Failed to process chat message.' });
    }
}
