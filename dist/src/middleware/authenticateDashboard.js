"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateDashboard = authenticateDashboard;
const node_1 = require("better-auth/node");
const auth_1 = require("../config/auth");
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
async function authenticateDashboard(req, res, next) {
    try {
        const session = await auth_1.auth.api.getSession({
            headers: (0, node_1.fromNodeHeaders)(req.headers),
        });
        if (!session) {
            res.status(401).json({ error: 'Unauthorized. No active session found.' });
            return;
        }
        const dbUser = await db_1.prisma.user.findUnique({
            where: { id: session.user.id },
            select: { planTier: true },
        });
        req.merchant = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            planTier: dbUser?.planTier || 'FREE',
        };
        next();
    }
    catch (error) {
        logger_1.logger.warn('Dashboard Auth Failed:', error);
        res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
    }
}
