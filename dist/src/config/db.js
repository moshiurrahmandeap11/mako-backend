"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.executeRawNeonQuery = executeRawNeonQuery;
exports.connectDB = connectDB;
const client_1 = require("@prisma/client");
const https_1 = __importDefault(require("https"));
const env_1 = require("./env");
const logger_1 = require("../utils/logger");
exports.prisma = new client_1.PrismaClient();
const connectionString = env_1.env.DATABASE_URL;
function getNeonSqlEndpoint(connStr) {
    try {
        const sanitized = connStr.replace(/^postgres(ql)?:\/\//i, 'http://');
        const parsed = new URL(sanitized);
        return `https://${parsed.host}/sql`;
    }
    catch {
        return 'https://ep-long-cell-ay5y8og7-pooler.c-5.us-east-2.aws.neon.tech/sql';
    }
}
// Raw HTTPS query helper for pgvector cosine similarity search
function executeRawNeonQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        if (!connectionString) {
            resolve([]);
            return;
        }
        let formattedQuery = query;
        params.forEach((param, index) => {
            let valStr = '';
            if (Array.isArray(param)) {
                valStr = `'[${param.join(',')}]'::vector`;
            }
            else if (typeof param === 'string') {
                valStr = `'${param.replace(/'/g, "''")}'`;
            }
            else if (param === null || param === undefined) {
                valStr = 'NULL';
            }
            else {
                valStr = String(param);
            }
            // Use word boundary to prevent $1 matching $10, and clean double vector casting
            formattedQuery = formattedQuery.replace(new RegExp(`\\$${index + 1}(?:::vector)?\\b`, 'g'), valStr);
        });
        const endpoint = getNeonSqlEndpoint(connectionString);
        const data = JSON.stringify({ query: formattedQuery });
        const req = https_1.default.request(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Neon-Connection-String': connectionString,
                'Content-Length': Buffer.byteLength(data),
            },
            family: 4,
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(body);
                        resolve(parsed.rows || []);
                    }
                    catch (e) {
                        resolve([]);
                    }
                }
                else {
                    logger_1.logger.warn(`Neon HTTP SQL returned status ${res.statusCode}: ${body}`);
                    resolve([]);
                }
            });
        });
        req.on('error', (err) => {
            logger_1.logger.warn('Neon HTTPS request failed:', err.message);
            resolve([]);
        });
        req.write(data);
        req.end();
    });
}
async function connectDB() {
    try {
        await exports.prisma.$connect();
        logger_1.logger.info('Connected to PostgreSQL Database via Prisma');
    }
    catch (error) {
        logger_1.logger.warn('Prisma $connect notice:', error);
    }
}
