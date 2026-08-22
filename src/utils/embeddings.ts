import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from './logger';

let geminiIndex = 0;
let openaiClients: { client: OpenAI; key: string }[] = [];
let openaiIndex = 0;

function initClients() {
  const openAiKeys = env.OPENAI_API_KEYS;
  openaiClients = openAiKeys.map((key) => ({
    key,
    client: new OpenAI({ apiKey: key }),
  }));
}

initClients();

export async function generateEmbedding(text: string): Promise<number[]> {
  const sanitizedText = text.replace(/\n/g, ' ').trim();
  if (!sanitizedText) {
    return new Array(1536).fill(0);
  }

  // 1. Primary: High-Speed Google Gemini Embeddings Pool (gemini-embedding-001 with 1536 dims)
  const geminiKeys = env.GEMINI_API_KEYS;
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
          signal: AbortSignal.timeout(1500),
          body: JSON.stringify({
            content: { parts: [{ text: sanitizedText.substring(0, 8000) }] },
            outputDimensionality: 1536,
          }),
        });

        if (resp.ok) {
          const data: any = await resp.json();
          if (data.embedding?.values && Array.isArray(data.embedding.values)) {
            return data.embedding.values;
          }
        }
      } catch (err: any) {
        logger.warn(`[Embeddings] Gemini key (${key.substring(0, 10)}...) error: ${err.message || err}`);
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
        const response = await client.embeddings.create(
          {
            model: 'text-embedding-3-small',
            input: sanitizedText.substring(0, 8000),
            dimensions: 1536,
          },
          { timeout: 1500 }
        );

        if (response.data[0]?.embedding) {
          return response.data[0].embedding;
        }
      } catch (error: any) {
        logger.warn(
          `[Embeddings] OpenAI key (${key.substring(0, 8)}...) failed. Error: ${error.message || error}`
        );
      }
    }
  }

  logger.error('[Embeddings] All embedding providers exhausted. Returning zero vector fallback.');
  return new Array(1536).fill(0);
}
