"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.me = me;
exports.updateDomains = updateDomains;
exports.logout = logout;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../../config/db");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
async function register(req, res) {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: 'Name, email, and password are required.' });
            return;
        }
        const existingMerchant = await db_1.prisma.user.findUnique({ where: { email } });
        if (existingMerchant) {
            res.status(409).json({ error: 'A merchant account with this email already exists.' });
            return;
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const merchant = await db_1.prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                allowedDomains: [],
                widgetConfig: {
                    create: {
                        primaryColor: '#111111',
                        greetingMessage: 'Hi! How can I help you shop today?',
                        botName: 'Shop Assistant',
                        position: 'bottom-right',
                        addToCartEnabled: true,
                    },
                },
            },
            include: {
                widgetConfig: true,
            },
        });
        const token = jsonwebtoken_1.default.sign({ merchantId: merchant.id, email: merchant.email }, env_1.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, {
            httpOnly: true,
            secure: env_1.env.NODE_ENV === 'production',
            sameSite: env_1.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.status(201).json({
            message: 'Registration successful',
            token,
            merchant: {
                id: merchant.id,
                name: merchant.name,
                email: merchant.email,
                allowedDomains: merchant.allowedDomains,
                planTier: merchant.planTier,
                widgetConfig: merchant.widgetConfig,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Merchant Registration Error:', error);
        res.status(500).json({ error: 'Failed to register merchant account.' });
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required.' });
            return;
        }
        const merchant = await db_1.prisma.user.findUnique({
            where: { email },
            include: { widgetConfig: true },
        });
        if (!merchant) {
            res.status(401).json({ error: 'Invalid email or password.' });
            return;
        }
        if (!merchant.passwordHash) {
            res.status(401).json({ error: 'This account is set up with social authentication. Please log in with Google or GitHub.' });
            return;
        }
        const isMatch = await bcrypt_1.default.compare(password, merchant.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid email or password.' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ merchantId: merchant.id, email: merchant.email }, env_1.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, {
            httpOnly: true,
            secure: env_1.env.NODE_ENV === 'production',
            sameSite: env_1.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        res.json({
            message: 'Login successful',
            token,
            merchant: {
                id: merchant.id,
                name: merchant.name,
                email: merchant.email,
                allowedDomains: merchant.allowedDomains,
                planTier: merchant.planTier,
                widgetConfig: merchant.widgetConfig,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Merchant Login Error:', error);
        res.status(500).json({ error: 'Failed to authenticate merchant.' });
    }
}
async function me(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const merchant = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
            select: {
                id: true,
                name: true,
                email: true,
                allowedDomains: true,
                planTier: true,
                createdAt: true,
                widgetConfig: true,
            },
        });
        if (!merchant) {
            res.status(404).json({ error: 'Merchant not found.' });
            return;
        }
        res.json({ merchant });
    }
    catch (error) {
        logger_1.logger.error('Get Merchant Profile Error:', error);
        res.status(500).json({ error: 'Failed to fetch merchant profile.' });
    }
}
async function updateDomains(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const planTier = req.merchant?.planTier || 'FREE';
        const { allowedDomains } = req.body;
        if (!Array.isArray(allowedDomains)) {
            res.status(400).json({ error: 'allowedDomains must be an array of domain strings.' });
            return;
        }
        const sanitizedDomains = allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
        const domainLimits = {
            FREE: 1,
            STARTER: 2,
            PRO: 5,
            ENTERPRISE: Infinity,
        };
        const limit = domainLimits[planTier] !== undefined ? domainLimits[planTier] : 1;
        if (sanitizedDomains.length > limit) {
            res.status(400).json({
                error: `Your ${planTier} plan allows whitelisting up to ${limit} domains. Please upgrade to add more domains.`
            });
            return;
        }
        const updatedMerchant = await db_1.prisma.user.update({
            where: { id: merchantId },
            data: { allowedDomains: sanitizedDomains },
            select: { id: true, allowedDomains: true },
        });
        res.json({
            message: 'Allowed domains updated successfully',
            allowedDomains: updatedMerchant.allowedDomains,
        });
    }
    catch (error) {
        logger_1.logger.error('Update Domains Error:', error);
        res.status(500).json({ error: 'Failed to update allowed domains.' });
    }
}
async function logout(req, res) {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
}
