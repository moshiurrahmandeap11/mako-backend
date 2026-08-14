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
exports.register = register;
exports.login = login;
exports.me = me;
exports.updateDomains = updateDomains;
exports.logout = logout;
exports.scrapeUrl = scrapeUrl;
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
        // Automatically trigger scraping for the updated domains in the background
        const { scrapeWebsite } = await Promise.resolve().then(() => __importStar(require('../../services/scraper.service')));
        if (merchantId) {
            for (const domain of sanitizedDomains) {
                // Run asynchronously without awaiting so it doesn't block the API response
                scrapeWebsite(domain, merchantId).catch((err) => {
                    logger_1.logger.error(`Background scrape failed for ${domain}:`, err);
                });
            }
        }
        res.json({
            message: 'Allowed domains updated successfully and background scraping initiated',
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
async function scrapeUrl(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { url } = req.body;
        if (!url) {
            res.status(400).json({ error: 'Target URL is required.' });
            return;
        }
        const { scrapeWebsite } = await Promise.resolve().then(() => __importStar(require('../../services/scraper.service')));
        const result = await scrapeWebsite(url, merchantId);
        res.json({
            message: 'Website scraped and catalog indexed successfully!',
            result,
        });
    }
    catch (error) {
        logger_1.logger.error('Scrape URL Error:', error);
        res.status(500).json({ error: error.message || 'Failed to scrape website.' });
    }
}
