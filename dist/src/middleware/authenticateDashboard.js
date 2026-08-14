"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPlanTierCache = clearPlanTierCache;
exports.authenticateDashboard = authenticateDashboard;
const node_1 = require("better-auth/node");
const auth_1 = require("../config/auth");
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const planTierCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
function clearPlanTierCache(userId) {
    if (userId) {
        planTierCache.delete(userId);
    }
    else {
        planTierCache.clear();
    }
}
async function authenticateDashboard(req, res, next) {
    try {
        const session = await auth_1.auth.api.getSession({
            headers: (0, node_1.fromNodeHeaders)(req.headers),
        });
        if (!session) {
            res.status(401).json({ error: 'Unauthorized. No active session found.' });
            return;
        }
        const userId = session.user.id;
        let planTier = 'FREE';
        const now = Date.now();
        const cached = planTierCache.get(userId);
        if (cached && cached.expires > now) {
            planTier = cached.tier;
        }
        else {
            const dbUser = await db_1.prisma.user.findUnique({
                where: { id: userId },
                select: { planTier: true },
            });
            planTier = dbUser?.planTier || 'FREE';
            // Cleanup to prevent memory leaks over time
            if (planTierCache.size > 1000)
                planTierCache.clear();
            planTierCache.set(userId, { tier: planTier, expires: now + CACHE_TTL_MS });
        }
        req.merchant = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            planTier,
        };
        next();
    }
    catch (error) {
        logger_1.logger.warn('Dashboard Auth Failed:', error);
        res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
    }
}
