"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
exports.env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '4000', 10),
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_dev_key_32chars_min',
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'localhost',
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:4000',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    WIDGET_CDN_URL: process.env.WIDGET_CDN_URL || 'http://localhost:4000/widget.js',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || '',
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:4000/api/auth',
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || 'Labto AI Assistant <no-reply@labto.ai>',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@ahsanul.dev',
};
