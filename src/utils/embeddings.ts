import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from './logger';

let openaiClients: { client: OpenAI; key: string }[] = [];
let clientIndex = 0;

function initEmbeddingClients() {
  const keys = env.OPENAI_API_KEYS;
  openaiClients = keys.map((key) => ({
    key,
    client: new OpenAI({ apiKey: key }),
  }));
}

initEmbeddingClients();

export async function generateEmbedding(text: string): Promise<number[]> {
  if (openaiClients.length === 0) {
    logger.warn('OPENAI_API_KEY is not set. Falling back to zero-filled 1536 vector.');
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
    } catch (error: any) {
      logger.warn(
        `[Embeddings] OpenAI key (${key.substring(0, 8)}...) failed. Retrying with next key in pool... Error: ${
          error.message || error
        }`
      );

      if (i === attempts - 1) {
        logger.error('All OpenAI embedding keys exhausted. Returning zero vector fallback.');
        return new Array(1536).fill(0);
      }
    }
  }

  return new Array(1536).fill(0);
}
