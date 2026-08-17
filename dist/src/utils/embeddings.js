"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../config/env");
const logger_1 = require("./logger");
let geminiIndex = 0;
let openaiClients = [];
let openaiIndex = 0;
function initClients() {
    const openAiKeys = env_1.env.OPENAI_API_KEYS;
    openaiClients = openAiKeys.map((key) => ({
        key,
        client: new openai_1.default({ apiKey: key }),
    }));
}
initClients();
async function generateEmbedding(text) {
    const sanitizedText = text.replace(/\n/g, ' ').trim();
    if (!sanitizedText) {
        return new Array(1536).fill(0);
    }
    // 1. Primary: High-Speed Google Gemini Embeddings Pool (gemini-embedding-001 with 1536 dims)
    const geminiKeys = env_1.env.GEMINI_API_KEYS;
    if (geminiKeys.length > 0) {
        const attempts = geminiKeys.length;
        for (let i = 0; i < attempts; i++) {
            const key = geminiKeys[geminiIndex];
            geminiIndex = (geminiIndex + 1) % geminiKeys.length;
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: { parts: [{ text: sanitizedText.substring(0, 8000) }] },
                        outputDimensionality: 1536,
                    }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.embedding?.values && Array.isArray(data.embedding.values)) {
                        return data.embedding.values;
                    }
                }
            }
            catch (err) {
                logger_1.logger.warn(`[Embeddings] Gemini key (${key.substring(0, 10)}...) error: ${err.message || err}`);
            }
        }
    }
    // 2. Secondary: OpenAI Embeddings Pool
    if (openaiClients.length > 0) {
        const attempts = openaiClients.length;
        for (let i = 0; i < attempts; i++) {
            const { client, key } = openaiClients[openaiIndex];
            openaiIndex = (openaiIndex + 1) % openaiClients.length;
            try {
                const response = await client.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: sanitizedText.substring(0, 8000),
                    dimensions: 1536,
                });
                if (response.data[0]?.embedding) {
                    return response.data[0].embedding;
                }
            }
            catch (error) {
                logger_1.logger.warn(`[Embeddings] OpenAI key (${key.substring(0, 8)}...) failed. Error: ${error.message || error}`);
            }
        }
    }
    logger_1.logger.error('[Embeddings] All embedding providers exhausted. Returning zero vector fallback.');
    return new Array(1536).fill(0);
}
