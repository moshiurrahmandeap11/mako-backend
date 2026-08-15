"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPlanTierCache = clearPlanTierCache;
exports.authenticateDashboard = authenticateDashboard;
exports.requireAdmin = requireAdmin;
const node_1 = require("better-auth/node");
const auth_1 = require("../config/auth");
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
const userMetaCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
function clearPlanTierCache(userId) {
    if (userId) {
        userMetaCache.delete(userId);
    }
    else {
        userMetaCache.clear();
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
        let role = 'MERCHANT';
        const now = Date.now();
        const cached = userMetaCache.get(userId);
        if (cached && cached.expires > now) {
            planTier = cached.tier;
            role = cached.role;
        }
        else {
            const dbUser = await db_1.prisma.user.findUnique({
                where: { id: userId },
                select: { planTier: true, role: true, email: true },
            });
            planTier = dbUser?.planTier || 'FREE';
            role = dbUser?.role || (dbUser?.email === 'admin@ahsanul.dev' ? 'ADMIN' : 'MERCHANT');
            // Cleanup to prevent memory leaks over time
            if (userMetaCache.size > 1000)
                userMetaCache.clear();
            userMetaCache.set(userId, { tier: planTier, role, expires: now + CACHE_TTL_MS });
        }
        req.merchant = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            planTier,
            role,
        };
        next();
    }
    catch (error) {
        logger_1.logger.warn('Dashboard Auth Failed:', error);
        res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
    }
}
function requireAdmin(req, res, next) {
    if (!req.merchant || (req.merchant.role !== 'ADMIN' && req.merchant.email !== 'admin@ahsanul.dev')) {
        res.status(403).json({ error: 'Forbidden. Admin access required.' });
        return;
    }
    next();
}
