"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateWidget = authenticateWidget;
const db_1 = require("../config/db");
const apiKeyGenerator_1 = require("../utils/apiKeyGenerator");
const logger_1 = require("../utils/logger");
const domain_1 = require("../utils/domain");
async function authenticateWidget(req, res, next) {
    try {
        const rawApiKey = (req.headers['x-api-key'] || req.query.apiKey);
        if (!rawApiKey) {
            res.status(401).json({ error: 'Missing x-api-key header or apiKey query parameter.' });
            return;
        }
        const hashedKey = (0, apiKeyGenerator_1.hashApiKey)(rawApiKey);
        const apiKeyRecord = await db_1.prisma.apiKey.findUnique({
            where: { hashedKey },
            include: {
                merchant: {
                    select: { id: true, name: true, allowedDomains: true, planTier: true },
                },
            },
        });
        if (!apiKeyRecord || !apiKeyRecord.isActive) {
            res.status(401).json({ error: 'Invalid or inactive API Key.' });
            return;
        }
        // Origin Domain Whitelist Validation
        const originHeader = req.headers.origin || req.headers.referer || '';
        let reqDomain = '';
        if (originHeader) {
            try {
                reqDomain = new URL(originHeader).hostname;
            }
            catch {
                reqDomain = '';
            }
        }
        // Combine domains from both the specific API Key and the Merchant's global widget settings
        const combinedDomains = [
            ...(apiKeyRecord.allowedDomains || []),
            ...(apiKeyRecord.merchant?.allowedDomains || [])
        ];
        const allowedDomains = [...new Set(combinedDomains)];
        const isDomainAllowed = allowedDomains.length === 0 || // empty allowedDomains means all domains allowed (for initial setup/dev)
            allowedDomains.some((rawDomain) => {
                const cleanDomain = (0, domain_1.normalizeDomain)(rawDomain);
                if (!cleanDomain || cleanDomain === '*')
                    return true;
                if (cleanDomain === reqDomain)
                    return true;
                // Localhost / 127.0.0.1 alias support
                if ((cleanDomain === 'localhost' || cleanDomain === '127.0.0.1') &&
                    (reqDomain === 'localhost' || reqDomain === '127.0.0.1')) {
                    return true;
                }
                // Subdomain / wildcard support (*.example.com or example.com matching sub.example.com)
                const rootDomain = cleanDomain.replace(/^\*\./, '');
                return reqDomain === rootDomain || reqDomain.endsWith(`.${rootDomain}`);
            });
        if (process.env.NODE_ENV === 'production' && !isDomainAllowed && reqDomain) {
            logger_1.logger.warn(`Widget API domain rejected. Request Domain: ${reqDomain}, Allowed: ${allowedDomains.join(',')}`);
            res.status(403).json({ error: `Domain '${reqDomain}' is not whitelisted for this API key.` });
            return;
        }
        // Update lastUsedAt asynchronously
        db_1.prisma.apiKey.update({
            where: { id: apiKeyRecord.id },
            data: { lastUsedAt: new Date() },
        }).catch(() => { });
        req.merchant = apiKeyRecord.merchant;
        req.apiKeyId = apiKeyRecord.id;
        req.apiKeyRecord = apiKeyRecord;
        next();
    }
    catch (error) {
        logger_1.logger.error('Widget authentication middleware error:', error);
        res.status(500).json({ error: 'Internal server authentication error.' });
    }
}
