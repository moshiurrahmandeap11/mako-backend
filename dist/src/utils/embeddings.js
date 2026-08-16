"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../config/env");
const logger_1 = require("./logger");
let openaiClients = [];
let clientIndex = 0;
function initEmbeddingClients() {
    const keys = env_1.env.OPENAI_API_KEYS;
    openaiClients = keys.map((key) => ({
        key,
        client: new openai_1.default({ apiKey: key }),
    }));
}
initEmbeddingClients();
async function generateEmbedding(text) {
    if (openaiClients.length === 0) {
        logger_1.logger.warn('OPENAI_API_KEY is not set. Falling back to zero-filled 1536 vector.');
        return new Array(1536).fill(0);
    }
    const sanitizedText = text.replace(/\n/g, ' ');
    const attempts = openaiClients.length;
    for (let i = 0; i < attempts; i++) {
        const { client, key } = openaiClients[clientIndex];
        clientIndex = (clientIndex + 1) % openaiClients.length;
        try {
            const response = await client.embeddings.create({
                model: 'text-embedding-3-small',
                input: sanitizedText,
                dimensions: 1536,
            });
            return response.data[0].embedding;
        }
        catch (error) {
            logger_1.logger.warn(`[Embeddings] OpenAI key (${key.substring(0, 8)}...) failed. Retrying with next key in pool... Error: ${error.message || error}`);
            if (i === attempts - 1) {
                logger_1.logger.error('All OpenAI embedding keys exhausted. Returning zero vector fallback.');
                return new Array(1536).fill(0);
            }
        }
    }
    return new Array(1536).fill(0);
}
