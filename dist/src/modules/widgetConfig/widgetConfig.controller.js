"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.updateConfig = updateConfig;
const db_1 = require("../../config/db");
const logger_1 = require("../../utils/logger");
async function getConfig(req, res) {
    try {
        const merchantId = req.merchant?.id;
        let config = await db_1.prisma.widgetConfig.findUnique({ where: { merchantId } });
        if (!config) {
            config = await db_1.prisma.widgetConfig.create({
                data: {
                    merchantId,
                    primaryColor: '#111111',
                    greetingMessage: 'Hi! How can I help you shop today?',
                    botName: 'Shop Assistant',
                    position: 'bottom-right',
                    addToCartEnabled: true,
                },
            });
        }
        res.json({ config });
    }
    catch (error) {
        logger_1.logger.error('Get Widget Config Error:', error);
        res.status(500).json({ error: 'Failed to fetch widget config.' });
    }
}
async function updateConfig(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { primaryColor, greetingMessage, botName, position, addToCartEnabled } = req.body;
        const config = await db_1.prisma.widgetConfig.upsert({
            where: { merchantId },
            create: {
                merchantId,
                primaryColor: primaryColor || '#111111',
                greetingMessage: greetingMessage || 'Hi! How can I help you shop today?',
                botName: botName || 'Shop Assistant',
                position: position || 'bottom-right',
                addToCartEnabled: addToCartEnabled !== undefined ? Boolean(addToCartEnabled) : true,
            },
            update: {
                ...(primaryColor !== undefined && { primaryColor }),
                ...(greetingMessage !== undefined && { greetingMessage }),
                ...(botName !== undefined && { botName }),
                ...(position !== undefined && { position }),
                ...(addToCartEnabled !== undefined && { addToCartEnabled: Boolean(addToCartEnabled) }),
            },
        });
        res.json({ message: 'Widget configuration updated successfully', config });
    }
    catch (error) {
        logger_1.logger.error('Update Widget Config Error:', error);
        res.status(500).json({ error: 'Failed to update widget config.' });
    }
}
