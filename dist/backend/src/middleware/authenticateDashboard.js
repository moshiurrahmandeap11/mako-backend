"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateDashboard = authenticateDashboard;
const node_1 = require("better-auth/node");
const auth_1 = require("../config/auth");
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
        req.merchant = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            planTier: session.user.planTier || 'FREE',
        };
        next();
    }
    catch (error) {
        logger_1.logger.warn('Dashboard Auth Failed:', error);
        res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
    }
}
