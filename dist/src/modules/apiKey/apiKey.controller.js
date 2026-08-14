"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKey = createKey;
exports.listKeys = listKeys;
exports.revokeKey = revokeKey;
exports.deleteKey = deleteKey;
const db_1 = require("../../config/db");
const apiKeyGenerator_1 = require("../../utils/apiKeyGenerator");
const logger_1 = require("../../utils/logger");
async function createKey(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { name, template, systemPrompt, allowedDomains } = req.body;
        const { fullKey, keyPrefix, hashedKey } = (0, apiKeyGenerator_1.generateApiKey)();
        const apiKey = await db_1.prisma.apiKey.create({
            data: {
                merchantId,
                keyPrefix,
                hashedKey,
                isActive: true,
                name: name || 'My Chatbot',
                template: template || 'Customer Support',
                systemPrompt: systemPrompt || '',
                allowedDomains: Array.isArray(allowedDomains) ? allowedDomains : [],
            },
        });
        res.status(201).json({
            message: 'API Key generated successfully. Save this key safely — it will not be shown again.',
            apiKey: {
                id: apiKey.id,
                keyPrefix: apiKey.keyPrefix,
                fullKey, // Return unhashed key only once!
                createdAt: apiKey.createdAt,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('API Key Generation Error:', error);
        res.status(500).json({ error: 'Failed to generate API Key.' });
    }
}
async function listKeys(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const keys = await db_1.prisma.apiKey.findMany({
            where: { merchantId },
            select: {
                id: true,
                keyPrefix: true,
                isActive: true,
                name: true,
                template: true,
                systemPrompt: true,
                allowedDomains: true,
                lastUsedAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ keys });
    }
    catch (error) {
        logger_1.logger.error('List API Keys Error:', error);
        res.status(500).json({ error: 'Failed to fetch API keys.' });
    }
}
async function revokeKey(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const keyId = req.params.id;
        const existingKey = await db_1.prisma.apiKey.findFirst({
            where: { id: keyId, merchantId },
        });
        if (!existingKey) {
            res.status(404).json({ error: 'API key not found.' });
            return;
        }
        await db_1.prisma.apiKey.update({
            where: { id: keyId },
            data: { isActive: false },
        });
        res.json({ message: 'API key revoked successfully.' });
    }
    catch (error) {
        logger_1.logger.error('Revoke API Key Error:', error);
        res.status(500).json({ error: 'Failed to revoke API Key.' });
    }
}
async function deleteKey(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const keyId = req.params.id;
        const existingKey = await db_1.prisma.apiKey.findFirst({
            where: { id: keyId, merchantId },
        });
        if (!existingKey) {
            res.status(404).json({ error: 'API key not found.' });
            return;
        }
        await db_1.prisma.apiKey.delete({
            where: { id: keyId },
        });
        res.json({ message: 'API key deleted successfully.' });
    }
    catch (error) {
        logger_1.logger.error('Delete API Key Error:', error);
        res.status(500).json({ error: 'Failed to delete API Key.' });
    }
}
