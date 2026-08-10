import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from './logger';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    logger.warn('OPENAI_API_KEY is not set. Falling back to zero-filled 1536 vector.');
    return new Array(1536).fill(0);
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' '),
      dimensions: 1536,
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('Error generating vector embedding:', error);
    return new Array(1536).fill(0);
  }
}
