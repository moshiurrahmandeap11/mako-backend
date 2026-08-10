"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../config/env");
const logger_1 = require("./logger");
const openai = env_1.env.OPENAI_API_KEY ? new openai_1.default({ apiKey: env_1.env.OPENAI_API_KEY }) : null;
async function generateEmbedding(text) {
    if (!openai) {
        logger_1.logger.warn('OPENAI_API_KEY is not set. Falling back to zero-filled 1536 vector.');
        return new Array(1536).fill(0);
    }
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text.replace(/\n/g, ' '),
            dimensions: 1536,
        });
        return response.data[0].embedding;
    }
    catch (error) {
        logger_1.logger.error('Error generating vector embedding:', error);
        return new Array(1536).fill(0);
    }
}
