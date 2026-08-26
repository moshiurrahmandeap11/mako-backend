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
exports.createSession = createSession;
exports.getWidgetConfigPublic = getWidgetConfigPublic;
exports.chat = chat;
exports.pingVisitor = pingVisitor;
exports.getChatHistory = getChatHistory;
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
                primaryColor: '#1DBF73',
                headerBgColor: '#FFFFFF',
                headerTextColor: '#222325',
                launcherBgColor: '#1DBF73',
                launcherIconColor: '#FFFFFF',
                greetingMessage: 'Hi! How can I help you today?',
                botName: 'AI Assistant',
                position: 'bottom-right',
                addToCartEnabled: true,
                suggestionChips: ["Show me your portfolio projects", "What services do you provide?", "How can I contact you?"],
                botAvatarUrl: null,
            };
        }
        res.json({
            primaryColor: config?.primaryColor || '#1DBF73',
            headerBgColor: config?.headerBgColor || '#FFFFFF',
            headerTextColor: config?.headerTextColor || '#222325',
            launcherBgColor: config?.launcherBgColor || '#1DBF73',
            launcherIconColor: config?.launcherIconColor || '#FFFFFF',
            greetingMessage: config?.greetingMessage || 'Hi! How can I help you today?',
            botName: config?.botName || 'AI Assistant',
            position: config?.position || 'bottom-right',
            addToCartEnabled: config?.addToCartEnabled !== undefined ? config.addToCartEnabled : true,
            suggestionChips: config?.suggestionChips || ["Show me your portfolio projects", "What services do you provide?", "How can I contact you?"],
            botAvatarUrl: config?.botAvatarUrl || null,
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
        const { sessionId, message, botMode, provider, imageUrl } = req.body;
        if ((!message || typeof message !== 'string') && !imageUrl) {
            res.status(400).json({ error: 'Message or imageUrl field is required.' });
            return;
        }
        const rawMessage = (message || '').trim();
        if (rawMessage.length > 250) {
            res.status(400).json({ error: 'Prompt length exceeds maximum allowed limit of 250 characters.' });
            return;
        }
        const effectiveSessionId = sessionId || `sess_${crypto_1.default.randomBytes(16).toString('hex')}`;
        const response = await (0, chat_service_1.processChatMessage)(merchantId, effectiveSessionId, rawMessage.slice(0, 250), botMode, provider, req.apiKeyRecord?.systemPrompt, req.apiKeyRecord?.template, imageUrl);
        res.json(response);
    }
    catch (error) {
        logger_1.logger.error('Widget Chat API Error:', error);
        res.status(500).json({ error: 'Failed to process chat message.' });
    }
}
async function pingVisitor(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { visitorId } = req.body;
        if (!visitorId) {
            res.status(400).json({ error: 'visitorId is required.' });
            return;
        }
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
        let country = 'United States';
        let countryCode = 'US';
        let city = 'New York';
        // 1. Cloudflare IP country header
        const cfCountry = req.headers['cf-ipcountry'];
        if (cfCountry && cfCountry.length === 2 && cfCountry !== 'XX') {
            countryCode = cfCountry.toUpperCase();
            country = countryCode === 'BD' ? 'Bangladesh' : countryCode === 'US' ? 'United States' : countryCode === 'GB' ? 'United Kingdom' : countryCode;
        }
        else {
            // 2. geoip-lite lookup
            const geoip = await Promise.resolve().then(() => __importStar(require('geoip-lite')));
            const geo = geoip.lookup(rawIp);
            if (geo) {
                countryCode = geo.country;
                country = geo.country;
                city = geo.city || city;
            }
            else if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.startsWith('192.168.') || rawIp.startsWith('10.')) {
                // Localhost development default fallback
                const lang = req.headers['accept-language'] || '';
                if (lang.includes('bn') || lang.includes('BD')) {
                    country = 'Bangladesh';
                    countryCode = 'BD';
                    city = 'Dhaka';
                }
                else {
                    country = 'United States';
                    countryCode = 'US';
                    city = 'San Francisco';
                }
            }
        }
        const visitor = await db_1.prisma.visitor.upsert({
            where: {
                merchantId_visitorId: {
                    merchantId,
                    visitorId,
                },
            },
            create: {
                merchantId,
                visitorId,
                ipAddress: rawIp,
                country,
                countryCode,
                city,
                pageViews: 1,
                lastSeenAt: new Date(),
            },
            update: {
                ipAddress: rawIp,
                country,
                countryCode,
                city,
                pageViews: { increment: 1 },
                lastSeenAt: new Date(),
            },
        });
        res.json({ success: true, visitor });
    }
    catch (error) {
        logger_1.logger.error('Ping Visitor Error:', error);
        res.status(500).json({ error: 'Failed to record visitor ping.' });
    }
}
async function getChatHistory(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const sessionId = req.query.sessionId || '';
        if (!sessionId) {
            res.json({ messages: [] });
            return;
        }
        const conversation = await db_1.prisma.conversation.findFirst({
            where: { merchantId, sessionId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!conversation || !conversation.messages) {
            res.json({ messages: [] });
            return;
        }
        const formattedMessages = conversation.messages.map((m) => {
            let products = undefined;
            let imageUrl = undefined;
            if (m.toolCalls && typeof m.toolCalls === 'object') {
                if (m.toolCalls.recommendedProducts) {
                    products = m.toolCalls.recommendedProducts;
                }
                if (m.toolCalls.imageUrl) {
                    imageUrl = m.toolCalls.imageUrl;
                }
            }
            let cleanText = m.content || '';
            if (cleanText.includes('data:image/')) {
                const imgMatch = cleanText.match(/!\[Uploaded Image\]\((data:image\/[^)]+)\)/);
                if (imgMatch && imgMatch[1]) {
                    if (!imageUrl)
                        imageUrl = imgMatch[1];
                    cleanText = cleanText.replace(/!\[Uploaded Image\]\(data:image\/[^)]+\)/g, '').trim();
                }
                cleanText = cleanText.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '').trim();
            }
            return {
                id: m.id,
                sender: m.role === 'user' ? 'user' : 'bot',
                text: cleanText,
                imageUrl,
                products,
                time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
        });
        res.json({ messages: formattedMessages });
    }
    catch (error) {
        logger_1.logger.error('Get Chat History Error:', error);
        res.status(500).json({ error: 'Failed to fetch chat history.' });
    }
}
